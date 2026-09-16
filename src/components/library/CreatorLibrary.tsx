import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DashboardStats, MemberStats } from "@/stats";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { MiniMemberCard } from "@/components/member/MiniMemberCard";
import { TRACK_ICONS } from "@/components/member/TrackChip";
import { MemberRow } from "@/components/library/MemberRow";
import { LibraryFilterDialog } from "@/components/library/LibraryFilterDialog";
import {
  BUCKET_MATCH,
  VIEW_PRESETS,
  type FollowersBucket,
  type GrowthMetricKey,
  type GrowthRange,
  type LibrarySearch,
  type MetricCtx,
  type TrackSortKey,
  type ViewKey,
} from "@/components/library/presets";
import { ClimbsList } from "@/components/leaderboard/ClimbsList";
import { TEN_K, titleOf } from "@/milestones";
import { Reveal, RevealItem } from "@/components/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  Columns2,
  Filter,
  Flag,
  LayoutGrid,
  Rows3,
  Shapes,
} from "lucide-react";
import { badge, fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 布局密度三态：单列行卡 / 双列卡片 / 卡片网格（多维表格的行高/画册思路），存 localStorage 记住偏好 */
const LAYOUTS = [
  { key: "rows", label: "单列", icon: Rows3 },
  { key: "duo", label: "双列", icon: Columns2 },
  { key: "cards", label: "卡片", icon: LayoutGrid },
] as const;
type LayoutKey = (typeof LAYOUTS)[number]["key"];
const LAYOUT_STORE_KEY = "kosx:libLayout";

/** 标签 chips 默认展示条数，其余折进「+N」 */
const TAG_PREVIEW = 8;

export function CreatorLibrary({
  stats,
  view,
  growthMetric,
  growthRange,
  trackSort,
  selTracks,
  selTags,
  bucket,
  onPatch,
}: {
  stats: DashboardStats;
  view: ViewKey;
  growthMetric: GrowthMetricKey;
  growthRange: GrowthRange;
  trackSort: TrackSortKey;
  selTracks: string[];
  selTags: string[];
  bucket: FollowersBucket;
  /** 视图/筛选状态统一回写 URL（undefined 的键会从 URL 移除） */
  onPatch: (p: LibrarySearch) => void;
}) {
  const preset = VIEW_PRESETS[view];
  const ctx: MetricCtx = { growthMetric, growthRange, trackSort };

  const [layout, setLayout] = useState<LayoutKey>(() => {
    try {
      const raw =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(LAYOUT_STORE_KEY)
          : null;
      return raw === "duo" || raw === "cards" ? raw : "rows";
    } catch {
      return "rows";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORE_KEY, layout);
    } catch {
      /* 隐私模式写不进去就静默 */
    }
  }, [layout]);

  // 筛选选项的计数（从全体成员聚合，随筛选状态不重置）
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of stats.members)
      for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 15);
  }, [stats.members]);
  const trackCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of stats.members)
      for (const t of m.tracks) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }, [stats.members]);
  const hasFilter =
    selTracks.length > 0 || selTags.length > 0 || bucket !== "all";
  const reset = () =>
    onPatch({ track: undefined, tag: undefined, bucket: undefined });
  // 筛选入口徽章：已生效的筛选条件数
  const appliedCount =
    selTracks.length + selTags.length + (bucket !== "all" ? 1 : 0);

  // 筛选弹窗：草稿态与标签搜索都收在 LibraryFilterDialog 内部（见该文件），
  // 这里只留「开/关」；这样弹窗里每敲一个字符不会连带重渲整个列表
  const [filterOpen, setFilterOpen] = useState(false);

  // 视图口径过滤 → 用户筛选 → 排序
  const base = useMemo(() => {
    let list = preset.filter
      ? stats.members.filter(preset.filter)
      : stats.members;
    if (selTracks.length > 0)
      list = list.filter((m) => selTracks.some((t) => m.tracks.includes(t)));
    if (selTags.length > 0)
      list = list.filter((m) => selTags.some((t) => m.tags.includes(t)));
    if (bucket !== "all")
      list = list.filter((m) => BUCKET_MATCH[bucket](m.latestFollowers ?? 0));
    return list;
  }, [preset, stats.members, selTracks, selTags, bucket]);
  const sorted = useMemo(
    () =>
      preset.sort ? [...base].sort((a, b) => preset.sort!(a, b, ctx)) : base,
    // ctx 由视图状态派生，直接进依赖
    [preset, base, growthMetric, growthRange, trackSort],
  );

  /** 行卡流（名次/渐晕/指标跟随当前视图）；rankOffset：赛段分组时保持全站名次 */
  const renderRows = (list: MemberStats[], showTracks = true) => (
    <ol className="space-y-3">
      {list.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <MemberRow
            m={m}
            rank={i + 1}
            metric={preset.metric(m, ctx)}
            showTracks={showTracks}
          />
        </RevealItem>
      ))}
      {list.length === 0 && (
        <li className="text-sm text-mist">{preset.empty}</li>
      )}
    </ol>
  );

  // 总排行的称号赛段：沿用旧榜单的做法——扁平名次列表，相邻成员的下一道大关不同处插分割线
  const renderTotalRows = () => {
    const rows: React.ReactNode[] = [];
    let prevSegment: number | null = null;
    sorted.forEach((m, i) => {
      if (prevSegment !== null && m.nextMilestone !== prevSegment) {
        rows.push(
          <SegmentDivider
            key={`seg-${m.nextMilestone}`}
            threshold={m.nextMilestone}
          />,
        );
      }
      prevSegment = m.nextMilestone;
      rows.push(
        <RevealItem key={m.id} y={16}>
          <MemberRow m={m} rank={i + 1} metric={preset.metric(m, ctx)} />
        </RevealItem>,
      );
    });
    return <ol className="space-y-3">{rows}</ol>;
  };

  /** 卡片网格（cols=2 双列 / 3 网格），指标与名次角标跟随当前视图；内容随视图直接换，不加逐卡弹入 */
  const renderCards = (list: MemberStats[], cols: 2 | 3) => (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {list.map((m, i) => (
        <MiniMemberCard key={m.id} m={m} metric={preset.metric(m, ctx)} rank={i + 1} />
      ))}
    </div>
  );

  /** 赛道分组视图：一条数据集按赛道字段分组，组内再按粉丝/增长排。
   *  memo 化：弹窗里的标签搜索词与列表同处一个组件，不缓存的话每敲一个字符
   *  都会把这 6 组「过滤 + 排序」全部重跑一遍 */
  const grouped = useMemo(() => (
    <div>
      {[...TRACKS, TRACK_OTHER].map((t) => {
        const group = base.filter((m) => m.tracks.includes(t.name));
        if (group.length === 0) return null;
        const gsorted =
          trackSort === "growth"
            ? [...group].sort((a, b) => b.growth7d - a.growth7d)
            : [...group].sort(
                (a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0),
              );
        const Icon = TRACK_ICONS[t.icon] ?? Shapes;
        const stat = stats.trackStats.find((s) => s.name === t.name);
        const isOther = t === TRACK_OTHER;
        return (
          <section key={t.slug} className="mt-9 first:mt-0">
            <div
              className={cn(
                "flex flex-wrap items-center gap-2.5 rounded-2xl bg-soft-surface px-4 py-2.5",
              )}
              title={t.description}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isOther ? "text-mist" : "text-signal-ink",
                )}
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold">{t.name}</h2>
              <span className="text-xs text-mist tabular-nums">
                {group.length} 位
              </span>
              {!isOther && stat ? (
                <span className="ml-auto text-xs text-mist tabular-nums">
                  粉丝 {fmt(stat.totalFollowers)} · 30 天{" "}
                  <b className="text-signal-ink">+{fmt(stat.growth30dTotal)}</b>
                </span>
              ) : (
                <span className="ml-auto text-xs text-mist">
                  过渡桶：攒够人数再细分
                </span>
              )}
            </div>
            <div className="mt-4">
              {layout === "rows"
                ? renderRows(gsorted, false)
                : renderCards(gsorted, layout === "duo" ? 2 : 3)}
            </div>
          </section>
        );
      })}
      {base.length === 0 && <p className="text-sm text-mist">{preset.empty}</p>}
    </div>
  ), [base, trackSort, layout, stats.trackStats, preset, ctx]);

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-8 sm:py-10">
      {/* 工具条：视图（多维表格的「视图 tab」）；右侧 = 筛选入口 + 布局密度 */}
      <Reveal delay={0.05}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={(v) =>
              onPatch({
                view: v as ViewKey,
                metric: undefined,
                range: undefined,
                gsort: undefined,
              })
            }
            options={Object.values(VIEW_PRESETS).map((p) => ({
              key: p.key,
              label: p.label,
            }))}
            size="md"
            ariaLabel="库视图"
            className="max-w-full overflow-x-auto"
          />
          {view !== "climbs" && (
            <div
              role="group"
              aria-label="筛选与布局"
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-soft-surface p-1"
            >
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                aria-label="筛选"
                title="筛选"
                aria-pressed={appliedCount > 0}
                className={cn(
                  "relative inline-flex size-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full transition-colors",
                  appliedCount > 0
                    ? "bg-primary text-signal-ink"
                    : "text-mist hover:text-ink",
                )}
              >
                <Filter className="size-4" aria-hidden="true" />
                {appliedCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-signal text-[10px] font-bold tabular-nums text-paper">
                    {appliedCount}
                  </span>
                )}
              </button>
              {LAYOUTS.map((l) => {
                const Icon = l.icon;
                const active = l.key === layout;
                return (
                  <button
                    key={l.key}
                    type="button"
                    aria-pressed={active}
                    title={l.label}
                    onClick={() => setLayout(l.key)}
                    className={cn(
                      "inline-flex size-8 cursor-pointer select-none items-center justify-center rounded-full transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-mist hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Reveal>

      {/* 筛选弹窗：草稿态与标签搜索都在组件内部（选了不生效，点「确认」一次性应用，页面不抖） */}
      <LibraryFilterDialog
        open={filterOpen}
        view={view}
        seed={{ bucket, selTracks, selTags, growthMetric, growthRange, trackSort }}
        tagCounts={tagCounts}
        trackCounts={trackCounts}
        onApply={onPatch}
        onClose={() => setFilterOpen(false)}
      />


      {/* 列表本体：同一份数据，随视图 × 筛选 × 布局变形 */}
      <div className="mt-6">
        {base.length === 0 && view !== "climbs" && view !== "track" ? (
          <div className="panel-card p-10 text-center">
            <p className="text-mist">{preset.empty}</p>
            {hasFilter && (
              <button
                onClick={reset}
                className="mt-3 text-sm font-semibold text-signal-ink underline-offset-4 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>
        ) : view === "climbs" ? (
          <ClimbsList stats={stats} />
        ) : view === "track" ? (
          grouped
        ) : layout === "rows" ? (
          view === "total" ? (
            renderTotalRows()
          ) : (
            renderRows(sorted)
          )
        ) : (
          renderCards(sorted, layout === "duo" ? 2 : 3)
        )}
      </div>
    </div>
  );
}

/** 赛段分割线：标注这道大关的门槛与称号；线下方正在冲刺，线上方已持有该称号，万粉大关信号橙 */
function SegmentDivider({ threshold }: { threshold: number }) {
  const tenK = threshold === TEN_K;
  return (
    <li
      className="flex items-center gap-3 pt-3"
      role="separator"
      aria-label={`赛段线：跨过 ${badge(threshold)} 粉获得称号「${titleOf(threshold)}」`}
    >
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
          tenK
            ? "bg-signal/10 text-signal-ink"
            : "bg-soft-surface text-mist",
        )}
      >
        <Flag className="size-3" aria-hidden="true" />
        跨过 {badge(threshold)} ·「{titleOf(threshold)}」
      </span>
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
    </li>
  );
}
