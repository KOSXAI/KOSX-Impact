import { roster, syncRoster } from "./roster";

/**
 * 每日数据采集入口，由 Cron Trigger（wrangler.jsonc 中的 crons）调用。
 *
 * 当前流程：
 * 1. 同步成员名册（data/members.json 是追踪名单的事实来源）
 * 2. 更新站点元数据
 *
 * TODO(kosx-impact): 接入 X 数据源后，在这里拉取每位成员的粉丝量并写入
 * snapshots 表；当粉丝量首次跨过里程碑阈值（如 1000 / 5000 / 10000）时
 * 写入 milestones 表。数据来源与口径见 README「数据与隐私」。
 */
export async function collect(env: Env): Promise<void> {
  await syncRoster(env, roster);

  await env.DB.prepare(
    `INSERT INTO site_meta (key, value) VALUES ('last_sync_at', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(new Date().toISOString()).run();
}
