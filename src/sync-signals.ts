/**
 * 每日信号同步（Worker cron，纯确定性计算）：成员被提及 + 社群信号（共同关注/品味）。
 * 复用 Worker 内 env.SOCIALDATA_API_KEY（线上 secret）直接调 SocialData、写 D1，
 * 把数据管线全部收敛进 Cloudflare——替代原先的本地脚本 + 本地自动化。
 * 被提及 = SocialData Search 按 @handle 拉站外提及；共同关注 = following 采样聚合；
 * 品味 = 帖子正文外部 @ 提及计数（纯库读零 API）。
 */
const API_BASE = "https://api.socialdata.tools";

async function throttledGet(env: Env, path: string): Promise<any> {
  const key = env.SOCIALDATA_API_KEY;
  if (!key) throw new Error("缺少 SOCIALDATA_API_KEY");
  // 500ms 间隔 ≈ 120 req/min，远低于 SocialData 共享限流
  await new Promise((r) => setTimeout(r, 500));
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

async function bumpCacheBust(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1"
  ).run();
}

/** 成员被提及：遍历活跃成员，search @handle -filter:replies 拉站外提及，写 member_mentions（幂等） */
export async function syncMemberMentions(env: Env): Promise<{ ok: number; total: number }> {
  const { results: members } = await env.DB.prepare(
    "SELECT id, handle FROM members WHERE status = 'active'"
  ).all();
  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO member_mentions (member_id, tweet_id, author_handle, author_name, text, mentioned_at, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  let total = 0;
  let ok = 0;
  for (const m of members as never as Array<{ id: string; handle: string }>) {
    try {
      const query = encodeURIComponent(`@${m.handle} -filter:replies`);
      const page = await throttledGet(env, `/twitter/search?query=${query}&type=Latest`);
      const tweets = Array.isArray(page.tweets) ? page.tweets : [];
      const batch = [];
      for (const t of tweets) {
        if (!t.id_str) continue;
        const author = (t.user?.screen_name || t.author_handle || "").toLowerCase();
        if (author === m.handle.toLowerCase()) continue; // 本人自提不算「被提及」
        batch.push(
          stmt.bind(m.id, t.id_str, t.user?.screen_name || t.author_handle || null, t.user?.name || t.author_name || null, t.full_text ?? null, t.tweet_created_at ?? null, now)
        );
        total++;
      }
      if (batch.length) await env.DB.batch(batch);
      ok++;
    } catch {
      /* 单成员失败跳过，不阻塞整轮 */
    }
  }
  await bumpCacheBust(env);
  return { ok, total };
}

/** 社群信号：共同关注（following 采样头部 8 位）+ 社群品味（帖子正文外部提及计数） */
export async function syncCommunitySignals(env: Env): Promise<{ following: number; taste: number }> {
  const { results: members } = await env.DB.prepare(
    `SELECT m.id, m.handle, m.user_id,
            (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS f
     FROM members m WHERE m.status = 'active'`
  ).all();
  const top = (members as never as Array<{ id: string; handle: string; user_id: string | null; f: number | null }>)
    .filter((m) => m.user_id)
    .sort((a, b) => (b.f ?? 0) - (a.f ?? 0))
    .slice(0, 8);

  // 共同关注：有多少位成员共同关注同一个外部大V
  const followingCount = new Map<string, { name: string | null; set: Set<string> }>();
  for (const m of top) {
    try {
      const page = await throttledGet(env, `/twitter/user/${m.user_id}/following`);
      const users = Array.isArray(page.users) ? page.users : [];
      for (const u of users) {
        const h = (u.screen_name || "").toLowerCase();
        if (!h) continue;
        const rec = followingCount.get(h) ?? { name: u.name ?? null, set: new Set<string>() };
        rec.set.add(m.id);
        followingCount.set(h, rec);
      }
    } catch {
      /* 单成员跳过 */
    }
  }

  // 社群品味：帖子正文里被提及最多的外部账号（排除成员自身，零额外 API）
  const { results: posts } = await env.DB.prepare("SELECT text FROM posts").all();
  const memberHandles = new Set(top.map((m) => m.handle.toLowerCase()));
  const tasteCount = new Map<string, number>();
  for (const r of posts as never as Array<{ text: string | null }>) {
    if (!r.text) continue;
    const matches = r.text.toLowerCase().match(/@([a-z0-9_]{2,30})/g) ?? [];
    for (const raw of matches) {
      const h = raw.slice(1);
      if (memberHandles.has(h)) continue;
      tasteCount.set(h, (tasteCount.get(h) ?? 0) + 1);
    }
  }
  const tasteTop = [...tasteCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

  const stmt = env.DB.prepare(
    "INSERT OR REPLACE INTO community_signal_counts (kind, handle, name, count, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  const batch = [];
  for (const [handle, rec] of followingCount) {
    if (rec.set.size >= 2) batch.push(stmt.bind("following", handle, rec.name, rec.set.size, now));
  }
  for (const [handle, count] of tasteTop) batch.push(stmt.bind("taste", handle, null, count, now));
  if (batch.length) await env.DB.batch(batch);
  await bumpCacheBust(env);
  return { following: [...followingCount.values()].filter((r) => r.set.size >= 2).length, taste: tasteTop.length };
}
