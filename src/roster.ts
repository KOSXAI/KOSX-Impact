import membersFile from "../data/members.json";

export interface RosterMember {
  id: string;
  handle: string;
  displayName?: string;
  goal?: number;
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
 * - 名册中的成员 upsert 进 members 表并恢复为 active
 * - 名册中已不存在的成员标记为 removed（保留历史数据，不删除）
 * - 新成员有 baselineFollowers 且尚无快照时，以 joinedAt 为起点回填首条快照
 */
export async function syncRoster(env: Env, roster: RosterFile): Promise<void> {
  // 先统一标记为 removed，随后名册中的成员会恢复为 active。
  // 不用 IN 列表比对，避免成员数超过 D1 绑定参数上限。
  await env.DB.prepare(
    `UPDATE members SET status = 'removed', updated_at = datetime('now')
     WHERE status != 'removed'`
  ).run();

  for (const member of roster.members) {
    await env.DB.prepare(
      `INSERT INTO members (id, handle, display_name, goal, joined_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         handle = excluded.handle,
         display_name = excluded.display_name,
         goal = excluded.goal,
         joined_at = excluded.joined_at,
         status = 'active',
         updated_at = datetime('now')`
    ).bind(
      member.id,
      member.handle,
      member.displayName ?? null,
      member.goal ?? 10000,
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
}
