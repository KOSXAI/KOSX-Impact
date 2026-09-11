import { Link } from "@tanstack/react-router";
import type { MemberStats } from "@/stats";
import { MemberRankRow } from "@/components/leaderboard/MemberRankRow";
import { PODIUM } from "@/components/leaderboard/podium";
import { TitleBadge } from "@/components/member/TitleBadge";
import { TrackChip } from "@/components/member/TrackChip";
import { GrowProgress } from "@/components/motion";
import { xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { MetricValue } from "./presets";

/**
 * 库的统一成员行卡：名次 + 头像 + 身份（名字/称号/@handle）+ 赛道 chips + 右侧主指标。
 * 排什么亮什么——指标由当前视图口径决定；前三名套荣誉渐晕。
 */
export function MemberRow({
  m,
  rank,
  metric,
  showTracks = true,
}: {
  m: MemberStats;
  rank: number;
  metric: MetricValue | null;
  /** 展示赛道 chips（赛道分组视图下分组头已标明赛道，关掉） */
  showTracks?: boolean;
}) {
  const name = m.displayName ?? m.handle;
  return (
    <MemberRankRow
      rank={rank}
      podium={PODIUM[rank - 1]}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/members/$id"
              params={{ id: m.id }}
              className="font-semibold underline-offset-4 hover:underline"
            >
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
          {showTracks && m.tracks.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m.tracks.map((t) => (
                <TrackChip key={t} name={t} />
              ))}
            </div>
          )}
        </div>
      }
      trailing={
        metric ? (
          <div className="shrink-0 text-right">
            <div
              className={cn(
                "text-lg font-bold tabular-nums",
                metric.tone === "signal" && "text-signal-ink",
              )}
            >
              {metric.value}
            </div>
            <div className="text-xs text-mist">{metric.label}</div>
            {metric.sub && (
              <div className="text-[11px] text-mist tabular-nums">
                {metric.sub}
              </div>
            )}
            {metric.progress != null && (
              <div className="mt-1 flex justify-end">
                <GrowProgress
                  value={metric.progress}
                  className="w-24"
                  ariaLabel={`距下一称号进度 ${metric.progress}%`}
                />
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
}
