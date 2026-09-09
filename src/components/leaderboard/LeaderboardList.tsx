import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { MemberStats } from "@/stats";
import { GrowProgress, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TitleBadge } from "@/components/member/TitleBadge";
import { Flag, Clock3 } from "lucide-react";
import { TEN_K, titleOf } from "@/milestones";
import { fmt, badge } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { PODIUM } from "./podium";

/** 总排行列表：最新粉丝量从高到低（stats.members 已按此排序），相邻称号大关处插赛段分割线 */
export function LeaderboardList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有成员上榜。</p>;
  // 赛段分割线：相邻成员的下一道大关不同处插线——线上方已持有该称号，线下方正在冲刺
  const rows: ReactNode[] = [];
  let prevSegment = -1;
  members.forEach((m, i) => {
    if (prevSegment !== -1 && m.nextMilestone !== prevSegment) {
      rows.push(<SegmentDivider key={`seg-${m.nextMilestone}`} threshold={m.nextMilestone} />);
    }
    prevSegment = m.nextMilestone;
    rows.push(
      <RevealItem key={m.id} y={16}>
        <LeaderboardMember member={m} rank={i + 1} podium={PODIUM[i]} />
      </RevealItem>
    );
  });
  return <ol className="space-y-3">{rows}</ol>;
}

/** 赛段分割线：标注这道大关的门槛与称号；万粉大关用信号橙突出 */
function SegmentDivider({ threshold }: { threshold: number }) {
  const tenK = threshold === TEN_K;
  return (
    <li className="flex items-center gap-3 pt-3">
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
          tenK ? "border-signal/40 bg-signal/10 text-signal" : "border-line bg-soft-surface text-mist"
        )}
      >
        <Flag className="size-3" aria-hidden="true" />
        跨过 {badge(threshold)} ·「{titleOf(threshold)}」
      </span>
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
    </li>
  );
}

/** 总排行行：前三名行带边框渐晕；右侧粉丝量 + 距下一称号进度 */
function LeaderboardMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
          {m.climbs > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist tabular-nums"
              title={`${m.climbs} 枚成就徽章`}
            >
              🏅 {m.climbs}
            </span>
          )}
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col items-start gap-1.5 sm:w-44 sm:items-end">
        {m.latestFollowers == null ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-mist"
            title="首次采集完成后自动上榜"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            首次采集排队中
          </span>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-bold tabular-nums">{fmt(m.latestFollowers)}</span>
              <span className="text-xs text-mist tabular-nums">
                还差 {fmt(m.nextMilestone - m.latestFollowers)}
              </span>
            </div>
            <div className="flex w-full items-center gap-2">
              <GrowProgress
                value={m.progressToNext}
                className="flex-1"
                ariaLabel={`距下一称号「${titleOf(m.nextMilestone)}」进度 ${m.progressToNext}%`}
              />
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist"
                title="下一称号"
              >
                <Flag className="size-3 text-signal" aria-hidden="true" />
                {titleOf(m.nextMilestone)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
