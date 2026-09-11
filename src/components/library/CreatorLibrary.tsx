import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import type { DashboardStats, MemberStats } from "@/stats";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { MiniMemberCard } from "@/components/member/MiniMemberCard";
import { TRACK_ICONS } from "@/components/member/TrackChip";
import { MemberRow } from "@/components/library/MemberRow";
import {
  BUCKET_MATCH,
  FOLLOWERS_BUCKETS,
  GROWTH_METRICS,
  GROWTH_RANGES,
  TRACK_SORTS,
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
  ArrowUpDown,
  Columns2,
  Filter,
  Flag,
  LayoutGrid,
  Rows3,
  Search,
  Shapes,
  Tags,
  Users,
  X,
  type LucideIcon,
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
  // 选中的标签若在折叠区，自动展开，避免「选了却看不见」
  const [showAllTags, setShowAllTags] = useState(false);
  // 标签搜索关键词（弹窗内草稿态，随弹窗重置）
  const [tagQuery, setTagQuery] = useState("");
  const tagsExpanded =
    showAllTags ||
    selTags.some(
      (t) => !tagCounts.slice(0, TAG_PREVIEW).some((x) => x.tag === t),
    );

  const hasFilter =
    selTracks.length > 0 || selTags.length > 0 || bucket !== "all";
  const reset = () =>
    onPatch({ track: undefined, tag: undefined, bucket: undefined });
  // 筛选入口徽章：已生效的筛选条件数
  const appliedCount =
    selTracks.length + selTags.length + (bucket !== "all" ? 1 : 0);

  // 筛选弹窗（草稿态）：弹窗里怎么选都不生效，点「确认」才一次性应用，页面不抖动
  interface FilterDraft {
    bucket: FollowersBucket;
    tracks: string[];
    tags: string[];
    metric?: GrowthMetricKey;
    range?: GrowthRange;
    gsort?: TrackSortKey;
  }
  const [pending, setPending] = useState<FilterDraft | null>(null);
  const openFilter = () => {
    setTagQuery("");
    setPending({
      bucket,
      tracks: [...selTracks],
      tags: [...selTags],
      metric: growthMetric,
      range: growthRange,
      gsort: trackSort,
    });
  };
  // 清空：只重置筛选，保留当前视图的排序口径
  const clearDraft = () =>
    setPending((p) => (p ? { ...p, bucket: "all", tracks: [], tags: [] } : p));
  const applyDraft = () => {
    if (!pending) return;
    const patch: LibrarySearch = {
      bucket: pending.bucket === "all" ? undefined : pending.bucket,
      track: pending.tracks.length > 0 ? pending.tracks.join(",") : undefined,
      tag: pending.tags.length > 0 ? pending.tags.join(",") : undefined,
    };
    if (view === "growth") {
      patch.metric = pending.metric;
      patch.range = pending.range;
    }
    if (view === "track") {
      patch.gsort = pending.gsort;
    }
    onPatch(patch);
    setPending(null);
  };
  // Esc 关闭 / Enter 确认：用 ref 拿最新草稿，避免闭包旧值
  const applyDraftRef = useRef(applyDraft);
  applyDraftRef.current = applyDraft;
  const panelRef = useRef<HTMLDivElement>(null);
  // 弹窗打开时锁背景滚动 + Esc/Enter 键 + 焦点接管
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
      if (e.key === "Enter") applyDraftRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    // 同时锁 html 与 body：页面在弹窗后面纹丝不动
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    // 焦点交给弹窗，读屏与键盘都能立即接管
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = "";
    };
  }, [pending != null]);

  // 标签搜索：有关键词时放开折叠全量匹配；无关键词走「预览 + 展开」
  const tagQueryTrim = tagQuery.trim();
  const visibleTagChips = tagQueryTrim
    ? tagCounts.filter((t) =>
        t.tag.toLowerCase().includes(tagQueryTrim.toLowerCase()),
      )
    : tagCounts.slice(0, tagsExpanded ? tagCounts.length : TAG_PREVIEW);

  const toggleParam = <T,>(cur: T[], v: T): T[] =>
    cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];

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

  /** 赛道分组视图：一条数据集按赛道字段分组，组内再按粉丝/增长排 */
  const renderGrouped = () => (
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
                "flex flex-wrap items-center gap-2.5 rounded-2xl border bg-soft-surface px-4 py-2.5",
                isOther ? "border-dashed border-line" : "border-line",
              )}
              title={t.description}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isOther ? "text-mist" : "text-signal",
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
                  <b className="text-signal">+{fmt(stat.growth30dTotal)}</b>
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
  );

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
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-soft-surface p-1"
            >
              <button
                type="button"
                onClick={openFilter}
                aria-label="筛选"
                title="筛选"
                aria-pressed={appliedCount > 0}
                className={cn(
                  "relative inline-flex size-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full transition-colors",
                  appliedCount > 0
                    ? "bg-white text-signal"
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
                        ? "bg-white text-paper"
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

      {/* 筛选弹窗：居中大卡 + 玻璃拟态背景；草稿态——选了不生效，点「确认」一次性应用，页面不抖 */}
      <AnimatePresence>
        {pending && (
          <div
            key="filter-dialog"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPending(null)}
              className="absolute inset-0 bg-black/65 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="筛选与排序"
              className="relative z-10 flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface/95 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)] outline-none backdrop-blur-xl sm:max-w-2xl"
            >
              {/* 头：标题 + 清空 + 关闭 */}
              <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
                <h2 className="text-lg font-bold">筛选与排序</h2>
                <div className="flex items-center gap-4">
                  {(pending.bucket !== "all" ||
                    pending.tracks.length > 0 ||
                    pending.tags.length > 0) && (
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="cursor-pointer text-sm text-mist transition-colors hover:text-ink"
                    >
                      清空
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    aria-label="关闭"
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-line text-mist transition-colors hover:border-signal/40 hover:text-ink"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* 体：排序口径（视图自带）→ 筛选组；草稿态，随便点都不抖 */}
              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 sm:px-7 sm:py-6">
                {view === "growth" && (
                  <section>
                    <SectionTitle icon={ArrowUpDown}>排序口径</SectionTitle>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <SegmentedControl
                        value={pending.metric ?? "growth"}
                        onChange={(k) =>
                          setPending({
                            ...pending,
                            metric: k as GrowthMetricKey,
                          })
                        }
                        options={GROWTH_METRICS.map((x) => ({
                          key: x.key,
                          label: x.label,
                        }))}
                        ariaLabel="成长指标"
                      />
                      <SegmentedControl
                        value={pending.range ?? 30}
                        onChange={(r) =>
                          setPending({ ...pending, range: r as GrowthRange })
                        }
                        options={GROWTH_RANGES.map((x) => ({
                          key: x.key,
                          label: x.label,
                        }))}
                        ariaLabel="时间范围"
                      />
                    </div>
                  </section>
                )}
                {view === "track" && (
                  <section>
                    <SectionTitle icon={ArrowUpDown}>组内排序</SectionTitle>
                    <div className="mt-2.5">
                      <SegmentedControl
                        value={pending.gsort ?? "followers"}
                        onChange={(k) =>
                          setPending({ ...pending, gsort: k as TrackSortKey })
                        }
                        options={TRACK_SORTS.map((x) => ({
                          key: x.key,
                          label: x.label,
                        }))}
                        ariaLabel="组内排序"
                      />
                    </div>
                  </section>
                )}
                <section>
                  <SectionTitle icon={Users}>粉丝量</SectionTitle>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {FOLLOWERS_BUCKETS.map((b) => (
                      <FilterChip
                        key={b.key}
                        active={pending.bucket === b.key}
                        onClick={() =>
                          setPending({ ...pending, bucket: b.key })
                        }
                      >
                        {b.label}
                      </FilterChip>
                    ))}
                  </div>
                </section>
                <section>
                  <SectionTitle icon={Shapes} count={pending.tracks.length}>
                    赛道
                  </SectionTitle>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[...TRACKS, TRACK_OTHER].map((t) => {
                      const count = trackCounts[t.name] ?? 0;
                      if (count === 0) return null;
                      const Icon = TRACK_ICONS[t.icon] ?? Shapes;
                      const active = pending.tracks.includes(t.name);
                      return (
                        <FilterChip
                          key={t.slug}
                          active={active}
                          dashed={t === TRACK_OTHER}
                          title={t.description}
                          onClick={() =>
                            setPending({
                              ...pending,
                              tracks: toggleParam(pending.tracks, t.name),
                            })
                          }
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                          {t.name}
                        </FilterChip>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <SectionTitle icon={Tags} count={pending.tags.length}>
                    标签
                  </SectionTitle>
                  <div className="relative mt-3">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mist"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                      placeholder="搜索标签"
                      className="h-9 w-full rounded-full border border-line bg-soft-surface pr-3 pl-10 text-sm outline-none transition-colors placeholder:text-mist focus:border-signal/40"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {visibleTagChips.map(({ tag, count }) => (
                      <FilterChip
                        key={tag}
                        active={pending.tags.includes(tag)}
                        onClick={() =>
                          setPending({
                            ...pending,
                            tags: toggleParam(pending.tags, tag),
                          })
                        }
                      >
                        {tag}
                      </FilterChip>
                    ))}
                    {tagCounts.length > TAG_PREVIEW && !tagQueryTrim && (
                      <FilterChip
                        active={tagsExpanded}
                        onClick={() => setShowAllTags((v) => !v)}
                      >
                        {tagsExpanded
                          ? "收起"
                          : `+${tagCounts.length - TAG_PREVIEW}`}
                      </FilterChip>
                    )}
                    {tagQueryTrim && visibleTagChips.length === 0 && (
                      <p className="text-sm text-mist">
                        没有匹配「{tagQueryTrim}」的标签
                      </p>
                    )}
                  </div>
                </section>
              </div>

              {/* 尾：取消 / 确认 */}
              <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-7">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="h-9 cursor-pointer rounded-full border border-line px-5 text-sm font-semibold text-mist transition-colors hover:text-ink sm:h-10"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={applyDraft}
                    className="h-9 cursor-pointer rounded-full bg-signal px-6 text-sm font-bold text-paper shadow-lg shadow-signal/30 transition-transform hover:scale-[1.02] active:scale-95 sm:h-10"
                  >
                    确认
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 列表本体：同一份数据，随视图 × 筛选 × 布局变形 */}
      <div className="mt-6">
        {base.length === 0 && view !== "climbs" && view !== "track" ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <p className="text-mist">{preset.empty}</p>
            {hasFilter && (
              <button
                onClick={reset}
                className="mt-3 text-sm font-semibold text-signal underline-offset-4 hover:underline"
              >
                清除筛选
              </button>
            )}
          </div>
        ) : view === "climbs" ? (
          <ClimbsList stats={stats} />
        ) : view === "track" ? (
          renderGrouped()
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

/** 弹窗内分组标题：图标 + 加粗标题 + 可选的「已选 N」徽章 */
function SectionTitle({
  icon: Icon,
  children,
  count,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  /** 当前组已选中数量（0 不显示徽章） */
  count?: number;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-bold">
      <Icon className="size-3.5 text-mist" aria-hidden="true" />
      {children}
      {count != null && count > 0 && (
        <span className="ml-0.5 rounded-full bg-signal/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-signal">
          {count}
        </span>
      )}
    </h3>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  dashed = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dashed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-xs transition-all duration-150 active:scale-95 sm:h-9 sm:px-3.5 sm:text-sm",
        dashed && !active && "border-dashed",
        active
          ? "border-signal/50 bg-signal/15 text-signal shadow-[0_0_12px_rgba(255,106,0,0.18)]"
          : "border-line bg-soft-surface text-mist hover:border-signal/40 hover:text-ink",
      )}
    >
      {children}
    </button>
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
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
          tenK
            ? "border-signal/40 bg-signal/10 text-signal"
            : "border-line bg-soft-surface text-mist",
        )}
      >
        <Flag className="size-3" aria-hidden="true" />
        跨过 {badge(threshold)} ·「{titleOf(threshold)}」
      </span>
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
    </li>
  );
}
