import { Link } from "@tanstack/react-router";
import type { MemberStats } from "@/stats";
import { RevealItem } from "@/components/motion";
import { TitleBadge } from "@/components/member/TitleBadge";
import { Clock3, Flame, Zap } from "lucide-react";
import { fmt } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { PODIUM } from "./podium";
import { MemberRankRow } from "./MemberRankRow";

/** 行头公用段：成员名 + 称号徽章 + @handle（点进档案页） */
function MemberIdentity({ m }: { m: MemberStats }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
        {name}
      </Link>
      <TitleBadge threshold={m.prevMilestone} />
      <a
        href={xProfileUrl(m.handle)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
      >
        @{m.handle}
      </a>
    </div>
  );
}

/** 新锐潜力榜：帖均曝光效率最高——粉丝量不大但内容被大量看见的潜力账号（回答「现在该关注谁」） */
export function RisingList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有帖子数据，新锐正在路上。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <RisingMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function RisingMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const eff = m.efficiencyVsMedian;
  return (
    <MemberRankRow
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
              {name}
            </Link>
            <TitleBadge threshold={m.prevMilestone} />
            <a
              href={xProfileUrl(m.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
            >
              @{m.handle}
            </a>
            {eff != null && eff >= 1.2 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                <Zap className="size-3" aria-hidden="true" />
                {eff >= 3 ? "曝光率爆棚" : `同量级 ${eff.toFixed(1)} 倍`}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-mist tabular-nums">
            近 30 天 {m.posts30d ?? 0} 帖 · 互动率 {m.engagementMedian != null ? `${(m.engagementMedian * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      }
      trailing={
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold tabular-nums">{m.avgViewsPerPost != null ? fmt(Math.round(m.avgViewsPerPost)) : "—"}</span>
            <span className="text-xs text-mist">帖均曝光</span>
          </div>
          <div className="text-xs text-mist tabular-nums">{m.latestFollowers != null ? `${fmt(m.latestFollowers)} 粉` : "首次采集排队中"}</div>
        </div>
      }
    />
  );
}

/** 勤快榜：近 30 天发帖最多的成员（更新频率 = 社群活力的日常证明） */
export function ActiveList({ members }: { members: MemberStats[] }) {
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <ActiveMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function ActiveMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const posts30d = m.posts30d ?? 0;
  const perWeek = (posts30d / 4.3).toFixed(1);
  return (
    <MemberRankRow
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={<MemberIdentity m={m} />}
      trailing={
        <div className="flex shrink-0 items-center gap-6">
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1">
              <Flame className="size-4 text-signal" aria-hidden="true" />
              <span className="font-bold tabular-nums">{posts30d}</span>
            </div>
            <div className="text-xs text-mist">近 30 天发帖</div>
          </div>
          <div className="text-right">
            <div className="font-bold tabular-nums text-mist">≈{perWeek}/周</div>
            <div className="text-xs text-mist">周均</div>
          </div>
        </div>
      }
    />
  );
}

/** 被提及榜：近 30 天被 X 上提及最多的成员（「被讨论热度」） */
export function MentionsList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">被提及数据采集中，热度马上就来。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <MentionMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function MentionMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const count = m.mentionCount30d ?? 0;
  return (
    <MemberRankRow
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
          <MemberIdentity m={m} />
          <div className="mt-1 text-xs text-mist tabular-nums">
            {m.latestFollowers != null ? `${fmt(m.latestFollowers)} 粉 · ` : ""}近 30 天
          </div>
        </div>
      }
      trailing={
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-2xl font-bold text-signal tabular-nums">{count}</span>
          <span className="text-xs text-mist">次被提及</span>
        </div>
      }
    />
  );
}

/** 影响力榜：综合指数（0-1000）= 规模 + 增长 + 互动 + 产能；有效粉丝 = 粉丝量 × 质量系数 */
export function InfluenceList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有成员上榜。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <InfluenceMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

/** 影响力榜行：排名 + 头像 + 四维分项条 + 指数大数（前三名与总排行同样的荣誉样式） */
function InfluenceMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const inf = m.influence;
  const parts: Array<[string, number, number]> = [
    ["规模", inf?.breakdown.scale ?? 0, 400],
    ["增长", inf?.breakdown.growth ?? 0, 200],
    ["互动", inf?.breakdown.engagement ?? 0, 250],
    ["产能", inf?.breakdown.output ?? 0, 150],
  ];
  return (
    <MemberRankRow
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
          <MemberIdentity m={m} />
          {inf && (
            <div className="mt-2 flex gap-2">
              {parts.map(([label, v, max]) => (
                <div key={label} className="flex-1" title={`${label} ${v} / ${max}`}>
                  <div className="flex justify-between text-[10px] leading-none text-mist">
                    <span>{label}</span>
                    <span className="tabular-nums">{v}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line/70">
                    <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      }
      trailing={
        inf ? (
          <div className="shrink-0 text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="bg-gradient-to-br from-amber-300 to-amber-600 bg-clip-text text-2xl font-extrabold tabular-nums text-transparent">
                {inf.score}
              </span>
              <span className="text-xs text-mist">/ 1000</span>
            </div>
            <div className="mt-0.5 text-xs text-mist tabular-nums" title={`质量系数 x${inf.qualityMultiplier.toFixed(2)}`}>
              有效粉丝 {fmt(inf.effectiveFollowers)}
            </div>
          </div>
        ) : (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-mist"
            title="首次采集完成后自动上榜"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            首次采集排队中
          </span>
        )
      }
    />
  );
}
