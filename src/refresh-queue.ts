/**
 * 成员自助更新队列：网页上提交 handle 触发即时刷新。
 *
 * 职责边界（写入管线在 collector.ts，避免循环依赖）：
 * - 本模块：handle 归一化、查询预览、入队去重、全局节流槽（CAS）
 * - collector.ts：消费 pending（processOldestPending / drainRefreshQueue），
 *   复用与 cron 采集完全相同的 writeSnapshot / checkMilestones / writeDailyStats
 *
 * 并发与额度模型：
 * - 入队去重：部分唯一索引（member_id WHERE status='pending'）保证同成员同时至多一条
 * - SocialData 免费额度只有每分钟 3 次，且数据源内置的 20 秒节流是 isolate 内存变量、
 *   跨请求不共享——真正的全局串行化靠 site_meta 节流槽的原子 CAS（最小间隔 21 秒）：
 *   提交时抢到槽就当场处理一条（即时通道），抢不到留在队列由 cron 兜底清空
 */
import { nextThreshold, tierOf } from "./milestones";

export interface RefreshPreview {
  id: string;
  handle: string;
  displayName: string | null;
  profileImage: string | null;
  latestFollowers: number | null;
  latestRecordedAt: string | null;
  tierKey: string;
  tierName: string;
  nextTier: number;
  /** 是否已有待处理的更新 */
  pending: boolean;
  /** 最近一次自助更新完成时间 */
  lastProcessedAt: string | null;
}

export type EnqueueResult = "enqueued" | "already_pending" | "throttled";

/** site_meta 中节流槽的键与最小间隔（≈ SocialData 每分钟 3 次免费额度） */
const SLOT_KEY = "self_refresh_slot_at";
const SLOT_INTERVAL_MS = 21_000;
/** 重复提交防抖窗口：窗口内再点一律视为「稍后再试」，不新增队列行 */
const RESUBMIT_WINDOW_MS = 60_000;

/**
 * 归一化用户输入为 X handle：接受主页链接（x.com/xxx、twitter.com/xxx，
 * 带协议或不带、带查询串或多级路径）或 @xxx / xxx；无效返回 null。
 */
export function normalizeHandle(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (raw.includes("/")) {
    try {
      const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
      raw = url.pathname.split("/").find((seg) => seg.length > 0) ?? "";
    } catch {
      return null;
    }
  }
  const handle = raw.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/** 按 handle 查询成员的看板预览（读本地库，不触发采集、不耗 SocialData 额度）。
 *  入参接受原始用户输入，内部先归一化（大小写、主页链接、@ 前缀统一处理）。 */
export async function lookupRefreshMember(env: Env, rawHandle: string): Promise<RefreshPreview | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  const member = (await env.DB.prepare(
    `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage,
            s.followers AS latestFollowers, s.recorded_at AS latestRecordedAt
     FROM members m
     LEFT JOIN snapshots s ON s.id = (
       SELECT id FROM snapshots WHERE member_id = m.id ORDER BY recorded_at DESC LIMIT 1
     )
     WHERE lower(m.handle) = ?1 AND m.status = 'active'`
  ).bind(handle).first()) as Record<string, unknown> | null;
  if (!member) return null;
  const memberId = member.id as string;
  const followers = (member.latestFollowers as number | null) ?? null;
  const tier = tierOf(followers ?? 0);

  const [pendingRow, doneRow] = await Promise.all([
    env.DB.prepare("SELECT 1 AS x FROM refresh_queue WHERE member_id = ?1 AND status = 'pending' LIMIT 1")
      .bind(memberId)
      .first(),
    env.DB.prepare("SELECT MAX(processed_at) AS lastAt FROM refresh_queue WHERE member_id = ?1 AND status = 'done'")
      .bind(memberId)
      .first() as Promise<{ lastAt: string | null } | null>,
  ]);

  return {
    id: memberId,
    handle: member.handle as string,
    displayName: (member.displayName as string | null) ?? null,
    profileImage: (member.profileImage as string | null) ?? null,
    latestFollowers: followers,
    latestRecordedAt: (member.latestRecordedAt as string | null) ?? null,
    tierKey: tier.key,
    tierName: tier.name,
    nextTier: nextThreshold(followers ?? 0),
    pending: pendingRow != null,
    lastProcessedAt: doneRow?.lastAt ?? null,
  };
}

/**
 * 入队（去重）：同一成员同时至多一条 pending（部分唯一索引兜底）；
 * 防抖窗口内重复点击返回 throttled，不新增行、不耗采集额度。
 */
export async function enqueueRefresh(env: Env, memberId: string, nowIso: string): Promise<EnqueueResult> {
  const recent = await env.DB.prepare(
    "SELECT 1 AS x FROM refresh_queue WHERE member_id = ?1 AND requested_at >= ?2 LIMIT 1"
  )
    .bind(memberId, new Date(new Date(nowIso).getTime() - RESUBMIT_WINDOW_MS).toISOString())
    .first();
  if (recent) return "throttled";

  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO refresh_queue (member_id, status, requested_at) VALUES (?1, 'pending', ?2)"
  )
    .bind(memberId, nowIso)
    .run();
  return (result.meta.changes ?? 0) > 0 ? "enqueued" : "already_pending";
}

/**
 * 抢全局节流槽（原子 CAS）：距上次成功 ≥21 秒才允许一次即时采集。
 * 并发提交下只有一条 UPDATE 生效（changes=1），其余自动落入队列等待 cron 兜底。
 */
export async function tryGrabRefreshSlot(env: Env, nowIso: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO site_meta (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = ?2
     WHERE (julianday(?2) - julianday(site_meta.value)) * 86400000 >= ?3`
  )
    .bind(SLOT_KEY, nowIso, SLOT_INTERVAL_MS)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * 自助注册：把提交的 handle 直接加入追踪（无审批流，提交即加入并同意公开展示）。
 * - 新 handle：建 members 行（id=handle，与既有命名约定一致），display_name 留空、
 *   由首次采集从 X 公开数据回填；基线快照由队列消费写入（首个快照即成长曲线起点）
 * - 已存在行（含 removed）：恢复 active 并标记 self_registered=1
 * - self_registered=1 使 syncRoster 的 removed 清扫跳过该成员
 */
export async function registerMember(env: Env, handle: string, nowIso: string): Promise<void> {
  const existing = (await env.DB.prepare(
    "SELECT id FROM members WHERE lower(handle) = ?1"
  ).bind(handle).first()) as { id: string } | null;

  if (existing) {
    await env.DB.prepare(
      "UPDATE members SET status = 'active', self_registered = 1, updated_at = datetime('now') WHERE id = ?1"
    ).bind(existing.id).run();
    return;
  }

  await env.DB.prepare(
    "INSERT INTO members (id, handle, joined_at, self_registered, status) VALUES (?1, ?1, ?2, 1, 'active')"
  ).bind(handle, nowIso.slice(0, 10)).run();
}
