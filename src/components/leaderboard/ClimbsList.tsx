import { Link } from "@tanstack/react-router";
import type { DashboardStats } from "@/stats";
import { RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { titleBadgeClass } from "@/components/member/TitleBadge";
import { titleOf } from "@/milestones";
import { fmtDate, badge } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/** 登阶记录：最近跨过称号大关的成员。行卡与总排行同一视觉语言（头像 + 名字 + 金色称号 chip + 日期） */
export function ClimbsList({ stats }: { stats: DashboardStats }) {
  if (stats.recentMilestones.length === 0) return <p className="text-mist">还没有登阶记录，第一枚成就正在路上。</p>;
  // 头像/句柄来自成员表：事件流只带 memberId，联一张 map 取展示数据
  const byId = new Map(stats.members.map((m) => [m.id, m]));
  return (
    <ol className="space-y-3">
      {stats.recentMilestones.map((m) => {
        const member = byId.get(m.memberId);
        const name = m.displayName ?? member?.displayName ?? m.handle;
        return (
          <RevealItem key={`${m.memberId}-${m.threshold}`} y={12}>
            <div className="card-lift flex items-center gap-x-3 gap-y-2 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-4 sm:gap-x-4 sm:p-5">
              <Avatar url={member?.profileImage} name={name} className="size-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link to="/members/$id" params={{ id: m.memberId }} className="font-semibold underline-offset-4 hover:underline">
                    {name}
                  </Link>
                  <a
                    href={xProfileUrl(m.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
                  >
                    @{m.handle}
                  </a>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    titleBadgeClass(m.threshold)
                  )}
                  title={`跨过 ${badge(m.threshold)} 大关`}
                >
                  <span aria-hidden="true">🏅</span>
                  {titleOf(m.threshold)}
                  <span className="font-normal text-mist/60 tabular-nums">{badge(m.threshold)}</span>
                </span>
                <span className="text-xs text-mist tabular-nums">{fmtDate(m.achievedAt)} 达成</span>
              </div>
            </div>
          </RevealItem>
        );
      })}
    </ol>
  );
}
