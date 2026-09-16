// scripts/_lib.mjs — 本地脚本共享工具层：SocialData key 读取、节流 fetch、SQL 转义、
// cache_bust 语句、wrangler d1 查询包装。只给 scripts/ 用，Worker 侧有各自实现，勿反向依赖。
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * SocialData API key：环境变量优先，.dev.vars 兜底。
 * （历史上脚本有两套互不兼容的解析正则，统一到这里。）
 * @returns {string | null}
 */
export function readSocialDataKey() {
  const env = process.env.SOCIALDATA_API_KEY;
  if (env) return env;
  const devVarsPath = resolve(ROOT, ".dev.vars");
  const devVars = existsSync(devVarsPath) ? readFileSync(devVarsPath, "utf-8") : "";
  return devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim() ?? null;
}

export const API_BASE = "https://api.socialdata.tools";

/**
 * SocialData 请求错误：带 status 供调用方区分处理。
 * - 402（余额耗尽）/ 401 / 403：重试无意义，应立即中止整轮（继续跑只会把钱和时间烧在注定失败的调用上）
 * - 429（限流）/ 5xx：瞬时，值得退避重试
 * - 404（账号不存在）：不该静默当通用错误吞掉，调用方应记录为「查无此账号」且不再重试
 */
export class SocialDataError extends Error {
  constructor(status, path, body) {
    super(`HTTP ${status} ${path}: ${String(body ?? "").slice(0, 200)}`);
    this.name = "SocialDataError";
    this.status = status;
  }
}

/** 致命错误（余额/鉴权问题）：整轮立即停，别继续打无效请求 */
export const isFatalSocialDataError = (e) =>
  e instanceof SocialDataError && (e.status === 401 || e.status === 402 || e.status === 403);

/** 429 / 5xx 的退避阶梯（毫秒）；用尽后抛出 */
const RETRY_BACKOFF_MS = [2_000, 8_000, 30_000];

/**
 * 全脚本共享的请求队列：所有 createThrottledGet 实例共用一个节流闸门。
 *
 * 为什么必须共享：此前每个 getter 各自持有 lastAt，一个脚本里建两个 getter
 * （或同一进程跑两段抓取）就各自按自己的间隔发车，实际速率是叠加的——
 * 而 SocialData 的 120 req/min 是账号级共享的，叠加就会打出 429。
 * `gate` 串起一条 promise 链：每个请求排队等自己的发车时刻，间隔按**实际发车**计算。
 *
 * 默认 850ms ≈ 70 req/min：给 Worker 侧（整点分片采集、10 分钟队列排空、
 * 每日 09:30 signals）留出余量。踩到 429 会触发 Worker 的全局熔断（冷却 1 小时），
 * 那比跑慢一点贵得多。
 */
export const SHARED_INTERVAL_MS = 850;
let lastDispatchAt = 0;
let gate = Promise.resolve();

function reserveSlot(intervalMs) {
  const slot = gate.then(async () => {
    const wait = lastDispatchAt + intervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastDispatchAt = Date.now();
  });
  // 单个请求失败不能让后续排队者全被拒绝
  gate = slot.catch(() => {});
  return slot;
}

/** 队列当前是否有被共享限流拖慢的迹象（供脚本打印诊断） */
export const sharedThrottleState = () => ({ lastDispatchAt, intervalMs: SHARED_INTERVAL_MS });

/**
 * 节流 GET（SocialData）：全进程共享间隔、串行发车，只防误触共享限流，不省成本。
 * 429 与 5xx 自动退避重试（2s/8s/30s）；402/401/403 直接抛 SocialDataError 由调用方中止。
 * @param {string} apiKey
 * @param {number} [intervalMs] 覆盖共享间隔（仅在你确实需要更慢时传）
 */
export function createThrottledGet(apiKey, intervalMs = SHARED_INTERVAL_MS) {
  return async function get(path) {
    let attempt = 0;
    for (;;) {
      await reserveSlot(intervalMs);
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return res.json();

      const body = await res.text();
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= RETRY_BACKOFF_MS.length) {
        throw new SocialDataError(res.status, path, body);
      }
      const backoff = RETRY_BACKOFF_MS[attempt];
      console.warn(`[socialdata] HTTP ${res.status} ${path} — ${backoff / 1000}s 后重试（第 ${attempt + 1} 次）`);
      await new Promise((r) => setTimeout(r, backoff));
      attempt++;
    }
  };
}

/* ============ 咨询锁：本地批量脚本之间、以及脚本与 Worker cron 之间的互斥 ============ */

/** 锁行在 site_meta 的键前缀；值 = 获取时刻（ISO），超时即视为释放 */
const LOCK_PREFIX = "script_lock:";

/**
 * 抢占命名咨询锁（CAS）：拿到返回 { ok: true, release }，已被占用返回 { ok: false, holder }。
 *
 * 用途：批量脚本每个成员都要发请求，两个脚本并行或与 Worker 整点采集撞车时，
 * 共享的 120 req/min 会被叠加打爆（429 → Worker 全局熔断 1 小时）。
 * 用 site_meta 做锁不需要新表，且 D1 的原子 UPDATE 天然是 CAS。
 *
 * ttlMinutes 兜底：脚本被 Ctrl-C / 断网挂掉时锁不会永久占死（默认 30 分钟）。
 * release() 是同步的（execFileSync），可安全挂在 process.on("exit")。
 *
 * @param {string} name 锁名（如 "sync-posts"）
 * @param {{ ttlMinutes?: number, quiet?: boolean }} [opts]
 */
export function acquireScriptLock(name, opts = {}) {
  const ttlMinutes = opts.ttlMinutes ?? 30;
  const key = LOCK_PREFIX + name;
  const now = new Date().toISOString();
  const owner = `${name}@${process.pid}@${now}`;
  d1Execute(
    `INSERT INTO site_meta (key, value) VALUES (${lit(key)}, ${lit(owner)})
     ON CONFLICT(key) DO UPDATE SET value = ${lit(owner)}
     WHERE (julianday(${lit(now)}) - julianday(site_meta.value)) * 1440 >= ${ttlMinutes};`
  );
  // CAS 落败时本次写入不生效，读回的值仍是持有者；用 owner 精确比对（而非只比存在性）
  const row = d1Query(`SELECT value FROM site_meta WHERE key = ${lit(key)}`)[0];
  if (row?.value !== owner) {
    return { ok: false, holder: row?.value ?? "unknown" };
  }
  return {
    ok: true,
    release() {
      d1Execute(`DELETE FROM site_meta WHERE key = ${lit(key)} AND value = ${lit(owner)};`);
    },
  };
}

/** SQL 字面量：null → NULL，单引号翻倍 */
export const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/** 值为空返回 NULL，否则 JSON 字符串字面量（media/quoted 列用） */
export const jsonOrNull = (v) => (v == null ? "NULL" : lit(JSON.stringify(v)));

/**
 * 从 User Tweets 单条媒体的 entities.media / extended_entities.media 提取展示数组。
 * 与 src/sources/socialdata.ts 的 extractMedia 保持同口径（Worker 侧有类型版，勿双向依赖）。
 */
export function extractMedia(tweet) {
  const raw = tweet.extended_entities?.media ?? tweet.entities?.media ?? [];
  const out = [];
  for (const m of raw) {
    if (!m.media_url_https) continue;
    const kind = m.type === "video" ? "video" : m.type === "animated_gif" ? "gif" : "photo";
    const best =
      kind === "photo"
        ? null
        : (m.video_info?.variants ?? [])
            .filter((v) => v.content_type === "video/mp4" && v.url)
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url ?? null;
    out.push({
      kind,
      url: m.media_url_https,
      tco: m.url ?? null,
      videoUrl: best,
      width: m.original_info?.width ?? null,
      height: m.original_info?.height ?? null,
      durationMs: m.video_info?.duration_millis ?? null,
    });
  }
  return out.length > 0 ? out : null;
}

/** 引用帖内嵌原文卡（quoted_status 最小展示集，首图一张），与 Worker 侧同口径 */
export function extractQuoted(tweet) {
  const q = tweet.quoted_status;
  if (!q || !q.user?.screen_name) return null;
  const media = extractMedia(q);
  return {
    handle: q.user.screen_name,
    name: q.user.name ?? null,
    profileImage: q.user.profile_image_url_https ?? null,
    text: q.full_text ?? null,
    url: q.id_str ? `https://x.com/${encodeURIComponent(q.user.screen_name)}/status/${q.id_str}` : null,
    media: media?.[0] ?? null,
  };
}

/** 数据写库后 cache_bust +1：读端点缓存键换新，各数据中心立即可见 */
export const BUMP_CACHE_BUST_SQL = `INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`;

/**
 * wrangler d1 execute 的原始封装（返回首条结果的 { results, success, meta }）。
 * 用 execFileSync 传参数数组而非拼 shell 字符串：SQL 里带 $、反引号、换行时，
 * JSON.stringify 的引号包裹并不能阻止 shell 展开（历史实现在这上面会被注入）。
 */
export function d1Execute(command) {
  const out = execFileSync(
    "wrangler",
    ["d1", "execute", "kosx-impact", "--remote", "--json", "--command", command],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
  );
  return JSON.parse(out)[0] ?? { results: [], meta: {} };
}

/** wrangler d1 --remote --json 查询，返回扁平化的 results 数组 */
export function d1Query(command) {
  return (d1Execute(command).results ?? []);
}
