import { Link } from "@tanstack/react-router";
import type { MemberStats } from "@/stats";
import { RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TitleBadge } from "@/components/member/TitleBadge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { fmt } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { PODIUM } from "./podium";
import { MemberRankRow } from "./MemberRankRow";

/** 成长榜：近 7 天 / 近 30 天口径切换（存 URL，可分享），按所选范围排序，小账号也有机会登顶 */
export const METRICS = [
  { key: "growth", label: "涨粉" },
  { key: "views", label: "曝光" },
  { key: "posts", label: "发帖" },
  { key: "replies", label: "评论" },
] as const;
export type MetricKey = "growth" | "views" | "posts" | "replies";
const RANGES = [
  { key: 1, label: "今日" },
  { key: 7, label: "近 7 天" },
  { key: 30, label: "近 30 天" },
] as const;

/** 按指标×时间档取值：涨粉取快照差值，曝光/发帖/评论取帖子窗口合计（多维时间榜口径矩阵） */
function metricValue(m: MemberStats, metric: MetricKey, range: 1 | 7 | 30): number {
  if (metric === "growth") return range === 1 ? (m.growth1d ?? 0) : range === 7 ? m.growth7d : m.growth30d;
  if (metric === "views") return range === 1 ? (m.viewsTodayGain ?? 0) : range === 7 ? (m.views7d ?? 0) : (m.views30d ?? 0);
  if (metric === "posts") return range === 1 ? (m.postsToday ?? 0) : range === 7 ? (m.posts7d ?? 0) : (m.posts30d ?? 0);
  return range === 1 ? (m.repliesToday ?? 0) : range === 7 ? (m.replies7d ?? 0) : (m.replies30d ?? 0);
}

export function GrowthSection({
  members,
  metric,
  onMetricChange,
  range,
  onRangeChange,
}: {
  members: MemberStats[];
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
  range: 1 | 7 | 30;
  onRangeChange: (r: 1 | 7 | 30) => void;
}) {
  const sorted = [...members].sort((a, b) => metricValue(b, metric, range) - metricValue(a, metric, range));

  return (
    <>
      {/* 本周王者叙事：近 7 天涨粉最多（周冠军 / 月冠军的轻量版） */}
      {range === 7 && metric === "growth" && sorted[0] && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-transparent px-4 py-3">
          <span className="text-sm font-semibold text-mist">本周王者</span>
          <Link to="/members/$id" params={{ id: sorted[0].id }} className="flex items-center gap-2 hover:underline">
            <Avatar url={sorted[0].profileImage} name={sorted[0].displayName ?? sorted[0].handle} className="size-6 shrink-0" />
            <span className="text-sm font-semibold">{sorted[0].displayName ?? sorted[0].handle}</span>
            <span className="text-sm font-bold text-signal tabular-nums">+{fmt(sorted[0].growth7d)}</span>
            <span className="text-xs text-mist">近 7 天</span>
          </Link>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <SegmentedControl
          value={metric}
          onChange={onMetricChange}
          options={METRICS.map((mt) => ({ key: mt.key, label: mt.label }))}
          ariaLabel="成长榜指标"
        />
        <SegmentedControl
          value={range}
          onChange={onRangeChange}
          options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
          ariaLabel="时间范围"
        />
      </div>
      <ol className="space-y-3">
        {sorted.map((m, i) => (
          <RevealItem key={m.id} y={16}>
            <GrowthMember member={m} rank={i + 1} metric={metric} range={range} podium={PODIUM[i]} />
          </RevealItem>
        ))}
      </ol>
    </>
  );
}

/** 成长榜行：前三名与总排行同样的荣誉样式（边框渐晕 + 榜位徽章）；右侧选中口径高亮，另一口径弱化 */
function GrowthMember({
  member: m,
  rank,
  metric,
  range,
  podium,
}: {
  member: MemberStats;
  rank: number;
  metric: MetricKey;
  range: 1 | 7 | 30;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const primary = metricValue(m, metric, range);
  const alternatives = RANGES.filter((r) => r.key !== range);
  return (
    <MemberRankRow
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
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
      }
      trailing={
        <div className="flex shrink-0 items-center gap-6">
          <div className="text-right">
            <div className={cn("text-lg font-bold tabular-nums", range === 1 ? "text-signal" : "text-mist")}>
              {metric === "growth" && primary > 0 ? "+" : ""}{fmt(primary)}
            </div>
            <div className="text-xs text-mist">{RANGES.find((r) => r.key === range)?.label}</div>
          </div>
          {alternatives.map((r) => (
            <div key={r.key} className="hidden text-right sm:block">
              <div className="font-semibold tabular-nums text-mist">
                {metric === "growth" && metricValue(m, metric, r.key) > 0 ? "+" : ""}{fmt(metricValue(m, metric, r.key))}
              </div>
              <div className="text-xs text-mist">{r.label}</div>
            </div>
          ))}
        </div>
      }
    />
  );
}
