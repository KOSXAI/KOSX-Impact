import membersFile from "../data/members.json";

export interface RosterMember {
  id: string;
  handle: string;
  displayName?: string;
  joinedAt: string;
  baselineFollowers?: number;
}

export interface RosterFile {
  members: RosterMember[];
}

// 名册随 Worker 一起打包（JSON 模块导入），每次部署后即生效。
export const roster = membersFile as RosterFile;

/**
 * 将成员名册同步到 D1。名册是追踪名单的事实来源：
 * - 名册中的成员 upsert 进 members 表（display_name 只回填缺失值，不覆盖已采集的 X 昵称）
 * - 数据库中存在、名册中已不存在且非自助注册的成员标记为 removed（保留历史数据，不删除）
 * - self_registered=1 的自助注册成员不受清扫（他们不在名册里，退出由维护者置 removed）
 * - 新成员有 baselineFollowers 且尚无快照时，以 joinedAt 为起点回填首条快照
 */
export async function syncRoster(env: Env, roster: RosterFile): Promise<void> {
  for (const member of roster.members) {
    await env.DB.prepare(
      `INSERT INTO members (id, handle, display_name, joined_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         handle = excluded.handle,
         display_name = COALESCE(display_name, excluded.display_name),
         joined_at = excluded.joined_at,
         status = 'active',
         updated_at = datetime('now')`
    ).bind(
      member.id,
      member.handle,
      member.displayName ?? null,
      member.joinedAt
    ).run();

    // 基线回填：只在还没有任何快照时插入，日期取加入追踪当天
    if (member.baselineFollowers !== undefined) {
      await env.DB.prepare(
        `INSERT INTO snapshots (member_id, followers, recorded_at)
         SELECT ?1, ?2, ?3
         WHERE NOT EXISTS (SELECT 1 FROM snapshots WHERE member_id = ?1)`
      ).bind(member.id, member.baselineFollowers, `${member.joinedAt}T00:00:00Z`).run();
    }
  }

  // removed 收敛放在全部 upsert 成功之后：中途失败最多让新多成员晚一步恢复，
  // 绝不会让本应在线的成员被人间蒸发（旧先删后恢复方案的中间态事故）。
  // 名册成员数远低于 D1 参数上限，用 IN 列表精确圈定，成员不在名册（含自助成员豁免）。
  const rosterIds = roster.members.map((m) => m.id);
  const { results: rows } = await env.DB.prepare(
    "SELECT id FROM members WHERE status != 'removed' AND self_registered = 0"
  ).all();
  const doomed = rows
    .map((r) => (r as { id: string }).id)
    .filter((id) => !rosterIds.includes(id));
  // 分批 100 个绑定参数（D1 单语句绑定上限）
  for (let i = 0; i < doomed.length; i += 100) {
    const batch = doomed.slice(i, i + 100);
    await env.DB.prepare(
      `UPDATE members SET status = 'removed', updated_at = datetime('now')
       WHERE id IN (${batch.map(() => "?").join(",")})`
    ).bind(...batch).run();
  }
}
