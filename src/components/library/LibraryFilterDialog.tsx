import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { TRACK_ICONS } from "@/components/member/TrackChip";
import {
  FOLLOWERS_BUCKETS,
  GROWTH_METRICS,
  GROWTH_RANGES,
  TRACK_SORTS,
  type FollowersBucket,
  type GrowthMetricKey,
  type GrowthRange,
  type LibrarySearch,
  type TrackSortKey,
  type ViewKey,
} from "@/components/library/presets";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ArrowUpDown, Search, Shapes, Tags, Users, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** 标签 chips 默认展示条数，其余折进「+N」 */
const TAG_PREVIEW = 8;

/** 弹窗草稿：选了不生效，点「确认」才一次性应用（页面不随点击抖动） */
export interface FilterDraft {
  bucket: FollowersBucket;
  tracks: string[];
  tags: string[];
  metric?: GrowthMetricKey;
  range?: GrowthRange;
  gsort?: TrackSortKey;
}

/** 当前已生效的筛选项（打开弹窗时用来初始化草稿） */
export interface FilterSeed {
  bucket: FollowersBucket;
  selTracks: string[];
  selTags: string[];
  growthMetric: GrowthMetricKey;
  growthRange: GrowthRange;
  trackSort: TrackSortKey;
}

function seedDraft(seed: FilterSeed): FilterDraft {
  return {
    bucket: seed.bucket,
    tracks: [...seed.selTracks],
    tags: [...seed.selTags],
    metric: seed.growthMetric,
    range: seed.growthRange,
    gsort: seed.trackSort,
  };
}

/**
 * 筛选与排序弹窗（自持草稿态）。
 *
 * 从 CreatorLibrary 抽出来独立成文件：那边原本 756 行里 223 行是这个弹窗的 JSX，
 * 并且 tagQuery 与列表同处一个组件——每敲一个字符列表都要重渲染一遍。
 * 草稿（含标签搜索词、展开态）全部收在这里，输入只影响弹窗自身。
 */
export function LibraryFilterDialog({
  open,
  view,
  seed,
  tagCounts,
  trackCounts,
  onApply,
  onClose,
}: {
  open: boolean;
  view: ViewKey;
  seed: FilterSeed;
  tagCounts: Array<{ tag: string; count: number }>;
  trackCounts: Record<string, number>;
  /** 确认后把草稿转成 URL patch 回写 */
  onApply: (patch: LibrarySearch) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterDraft>(() => seedDraft(seed));
  const [tagQuery, setTagQuery] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 每次打开都从「当前已生效的筛选」重新起稿，并重置标签搜索
  useEffect(() => {
    if (!open) return;
    setDraft(seedDraft(seed));
    setTagQuery("");
    // seed 是打开瞬间的快照，跟随其字段即可；刻意不把 seed 整体放进依赖，避免父级重渲时冲掉草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed.bucket, seed.selTracks, seed.selTags, seed.growthMetric, seed.growthRange, seed.trackSort]);

  const apply = () => {
    const patch: LibrarySearch = {
      bucket: draft.bucket === "all" ? undefined : draft.bucket,
      track: draft.tracks.length > 0 ? draft.tracks.join(",") : undefined,
      tag: draft.tags.length > 0 ? draft.tags.join(",") : undefined,
    };
    if (view === "growth") {
      patch.metric = draft.metric;
      patch.range = draft.range;
    }
    if (view === "track") {
      patch.gsort = draft.gsort;
    }
    onApply(patch);
    onClose();
  };
  // Esc 关闭 / Enter 确认：用 ref 拿最新的 apply，避免闭包旧值
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // 打开时锁背景滚动 + Esc/Enter 键 + 焦点接管
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") applyRef.current();
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
  }, [open, onClose]);

  const tagQueryTrim = tagQuery.trim();
  const tagsExpanded =
    showAllTags || draft.tags.some((t) => !tagCounts.slice(0, TAG_PREVIEW).some((x) => x.tag === t));
  const visibleTagChips = tagQueryTrim
    ? tagCounts.filter((t) => t.tag.toLowerCase().includes(tagQueryTrim.toLowerCase()))
    : tagCounts.slice(0, tagsExpanded ? tagCounts.length : TAG_PREVIEW);
  const toggleParam = <T,>(cur: T[], v: T): T[] =>
    cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  const dirty =
    draft.bucket !== "all" || draft.tracks.length > 0 || draft.tags.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <div key="filter-dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-scrim backdrop-blur-md"
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
            className="relative z-10 flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-edge bg-surface/95 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)] outline-none backdrop-blur-xl sm:max-w-2xl"
          >
            {/* 头：标题 + 清空 + 关闭 */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
              <h2 className="text-lg font-bold">筛选与排序</h2>
              <div className="flex items-center gap-4">
                {dirty && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, bucket: "all", tracks: [], tags: [] }))}
                    className="cursor-pointer text-sm text-mist transition-colors hover:text-ink"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭"
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-surface text-mist transition-colors hover:bg-wash-strong hover:text-ink"
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
                      value={draft.metric ?? "growth"}
                      onChange={(k) => setDraft({ ...draft, metric: k as GrowthMetricKey })}
                      options={GROWTH_METRICS.map((x) => ({ key: x.key, label: x.label }))}
                      ariaLabel="成长指标"
                    />
                    <SegmentedControl
                      value={draft.range ?? 30}
                      onChange={(r) => setDraft({ ...draft, range: r as GrowthRange })}
                      options={GROWTH_RANGES.map((x) => ({ key: x.key, label: x.label }))}
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
                      value={draft.gsort ?? "followers"}
                      onChange={(k) => setDraft({ ...draft, gsort: k as TrackSortKey })}
                      options={TRACK_SORTS.map((x) => ({ key: x.key, label: x.label }))}
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
                      active={draft.bucket === b.key}
                      onClick={() => setDraft({ ...draft, bucket: b.key })}
                    >
                      {b.label}
                    </FilterChip>
                  ))}
                </div>
              </section>
              <section>
                <SectionTitle icon={Shapes} count={draft.tracks.length}>
                  赛道
                </SectionTitle>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {[...TRACKS, TRACK_OTHER].map((t) => {
                    const count = trackCounts[t.name] ?? 0;
                    if (count === 0) return null;
                    const Icon = TRACK_ICONS[t.icon] ?? Shapes;
                    return (
                      <FilterChip
                        key={t.slug}
                        active={draft.tracks.includes(t.name)}
                        dashed={t === TRACK_OTHER}
                        title={t.description}
                        onClick={() => setDraft({ ...draft, tracks: toggleParam(draft.tracks, t.name) })}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {t.name}
                      </FilterChip>
                    );
                  })}
                </div>
              </section>
              <section>
                <SectionTitle icon={Tags} count={draft.tags.length}>
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
                    className="h-9 w-full rounded-full bg-soft-surface pr-3 pl-10 text-sm outline-none transition-colors placeholder:text-mist focus:border-signal/40"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {visibleTagChips.map(({ tag }) => (
                    <FilterChip
                      key={tag}
                      active={draft.tags.includes(tag)}
                      onClick={() => setDraft({ ...draft, tags: toggleParam(draft.tags, tag) })}
                    >
                      {tag}
                    </FilterChip>
                  ))}
                  {tagCounts.length > TAG_PREVIEW && !tagQueryTrim && (
                    <FilterChip active={tagsExpanded} onClick={() => setShowAllTags((v) => !v)}>
                      {tagsExpanded ? "收起" : `+${tagCounts.length - TAG_PREVIEW}`}
                    </FilterChip>
                  )}
                  {tagQueryTrim && visibleTagChips.length === 0 && (
                    <p className="text-sm text-mist">没有匹配「{tagQueryTrim}」的标签</p>
                  )}
                </div>
              </section>
            </div>

            {/* 尾：取消 / 确认 */}
            <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-7">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 cursor-pointer rounded-full bg-soft-surface px-5 text-sm font-semibold text-mist transition-colors hover:text-ink sm:h-10"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={apply}
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
  );
}

/** 弹窗内分组标题：图标 + 加粗标题 + 可选的「已选 N」徽章 */
function SectionTitle({
  icon: Icon,
  children,
  count,
}: {
  icon: LucideIcon;
  children: ReactNode;
  /** 当前组已选中数量（0 不显示徽章） */
  count?: number;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-bold">
      <Icon className="size-3.5 text-mist" aria-hidden="true" />
      {children}
      {count != null && count > 0 && (
        <span className="ml-0.5 rounded-full bg-signal/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-signal-ink">
          {count}
        </span>
      )}
    </h3>
  );
}

/** 弹窗内筛选 chip。
 *  注：`dashed` 是调用方（综合赛道）传入的参数，但原实现在 className 里从未用到它，
 *  本次抽取保持原样不动——改样式是独立决定，不该混在重构里。 */
function FilterChip({
  active,
  onClick,
  children,
  dashed = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 预留：过渡桶（综合）想做成虚线描边，当前未生效 */
  dashed?: boolean;
  title?: string;
}) {
  void dashed;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-xs transition-all duration-150 active:scale-95 sm:h-9 sm:px-3.5 sm:text-sm",
        active
          ? "bg-signal/15 text-signal-ink shadow-[0_0_12px_rgba(255,106,0,0.18)]"
          : "bg-soft-surface text-mist hover:bg-wash-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
