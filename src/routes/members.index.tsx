import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { fetchDashboard } from "@/data.functions";
import type { MemberStats } from "@/stats";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { Avatar } from "@/components/member/Avatar";
import { BannerImage } from "@/components/member/BannerImage";
import { MemberModuleHeader } from "@/components/member/MemberModuleHeader";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { toast } from "@/components/ui/toast";
import { BadgeCheck, Blocks, CandlestickChart, Check, Copy, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const TRACK_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

const FOLLOWERS_BUCKETS = [
  { key: "all", label: "全部" },
  { key: "lt10k", label: "1万以下" },
  { key: "10k-50k", label: "1万–5万" },
  { key: "gt50k", label: "5万以上" },
] as const;
type FollowersBucket = (typeof FOLLOWERS_BUCKETS)[number]["key"];

const BUCKET_MATCH: Record<Exclude<FollowersBucket, "all">, (f: number) => boolean> = {
  lt10k: (f) => f < 10_000,
  "10k-50k": (f) => f >= 10_000 && f < 50_000,
  gt50k: (f) => f >= 50_000,
};

const SORTS = [
  { key: "followers", label: "粉丝量" },
  { key: "growth30d", label: "近 30 天增长" },
  { key: "active", label: "发帖频率" },
  { key: "joined", label: "新成员" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

export const Route = createFileRoute("/members/")({
  loader: async () => {
    const stats = await fetchDashboard();
    // trackStats 供模块页头门牌卡的「N 条赛道」计数
    return { members: stats.members, trackStats: stats.trackStats };
  },
  head: () => {
    const title = `成员广场 · ${SITE_NAME}`;
    const desc = "按赛道、标签、粉丝量筛选 KOSX 万粉影响力计划的全部成员：横幅、头像、简介与真实数据一览。";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/members` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: MembersSquarePage,
});

function MembersSquarePage() {
  const { members, trackStats } = Route.useLoaderData();
  const [selTracks, setSelTracks] = useState<string[]>([]);
  const [selTags, setSelTags] = useState<string[]>([]);
  const [bucket, setBucket] = useState<FollowersBucket>("all");
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const [copied, setCopied] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  // 本地收藏（浏览器存储，无需登录）：广场可「只看收藏」
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("kosx:favs") : null;
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("kosx:favs", JSON.stringify(next));
      } catch {
        /* 隐私模式等写不进去就静默 */
      }
      return next;
    });
  };

  // 筛选选项的计数（从全体成员聚合，随筛选单选/多选状态不重置）
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 15);
  }, [members]);
  const trackCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) for (const t of m.tracks) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }, [members]);

  const hasFilter = selTracks.length > 0 || selTags.length > 0 || bucket !== "all" || sortKey !== "followers" || favOnly;
  const reset = () => {
    setSelTracks([]);
    setSelTags([]);
    setBucket("all");
    setSortKey("followers");
    setFavOnly(false);
  };

  // 赛道/标签多选为「命中任一」；粉丝量单选；排序默认粉丝量降序（与排行榜口径一致）
  const filtered = useMemo(() => {
    let list = members;
    if (selTracks.length > 0) list = list.filter((m) => selTracks.some((t) => m.tracks.includes(t)));
    if (selTags.length > 0) list = list.filter((m) => selTags.some((t) => m.tags.includes(t)));
    if (bucket !== "all") list = list.filter((m) => BUCKET_MATCH[bucket](m.latestFollowers ?? 0));
    if (favOnly) list = list.filter((m) => favs.includes(m.id));
    const sorted = [...list];
    if (sortKey === "growth30d") sorted.sort((a, b) => b.growth30d - a.growth30d);
    else if (sortKey === "active") sorted.sort((a, b) => (b.posts30d ?? 0) - (a.posts30d ?? 0));
    else if (sortKey === "joined") sorted.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
    else sorted.sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));
    return sorted;
  }, [members, selTracks, selTags, bucket, sortKey, favOnly, favs]);

  const copyAll = async () => {
    const text = filtered.map((m) => `@${m.handle}`).join(" ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`已复制 ${filtered.length} 位博主 @清单，可前往 X 批量关注`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时静默失败（桌面端受限环境） */
    }
  };

  const toggle = <T,>(cur: T[], v: T): T[] => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      {/* 博主模块统一页头：标题 + 三视图门牌卡（榜单 / 广场 / 赛道） */}
      <MemberModuleHeader view="members" stats={{ members, trackStats }} title="成员广场" />

      {/* 筛选栏：赛道 / 标签 / 粉丝量 / 排序 */}
      <Reveal delay={0.05}>
        <section className="mt-8 rounded-2xl border border-line bg-surface px-5 py-2 sm:px-6">
          <FilterRow label="赛道">
            <FilterChip active={selTracks.length === 0} onClick={() => setSelTracks([])}>
              全部
            </FilterChip>
            {[...TRACKS, TRACK_OTHER].map((t) => {
              const Icon = TRACK_ICONS[t.icon] ?? Shapes;
              const active = selTracks.includes(t.name);
              return (
                <FilterChip key={t.slug} active={active} onClick={() => setSelTracks((cur) => toggle(cur, t.name))}>
                  <Icon className="size-3.5" aria-hidden="true" />
                  {t.name}
                  <b className="tabular-nums">{trackCounts[t.name] ?? 0}</b>
                </FilterChip>
              );
            })}
          </FilterRow>
          <FilterRow label="标签">
            <FilterChip active={selTags.length === 0} onClick={() => setSelTags([])}>
              全部
            </FilterChip>
            {tagCounts.map(({ tag, count }) => (
              <FilterChip key={tag} active={selTags.includes(tag)} onClick={() => setSelTags((cur) => toggle(cur, tag))}>
                #{tag}
                <b className="tabular-nums">{count}</b>
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="粉丝量">
            {FOLLOWERS_BUCKETS.map((b) => (
              <FilterChip key={b.key} active={bucket === b.key} onClick={() => setBucket(b.key)}>
                {b.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="排序">
            {SORTS.map((s) => (
              <FilterChip key={s.key} active={sortKey === s.key} onClick={() => setSortKey(s.key)}>
                {s.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="收藏">
            <FilterChip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
              ♥ 只看收藏
              <b className="tabular-nums">{favs.length}</b>
            </FilterChip>
          </FilterRow>
        </section>
      </Reveal>

      {/* 结果操作条：计数 + 清除筛选 + 复制当前 @ 清单到 X 批量关注 */}
      <Reveal delay={0.08}>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-mist">{filtered.length} 位博主</span>
          {hasFilter && (
            <button onClick={reset} className="text-sm font-semibold text-signal underline-offset-4 hover:underline">
              清除筛选
            </button>
          )}
          <button
            onClick={copyAll}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold transition-colors hover:border-signal/40 hover:text-ink"
            title="一键复制当前筛选的 @ 清单，到 X 批量关注"
          >
            {copied ? <Check className="size-4 text-signal" /> : <Copy className="size-4" />}
            {copied ? "已复制" : "复制全部 @"}
          </button>
        </div>
      </Reveal>

      {/* 名片网格 */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-10 text-center">
          <p className="text-mist">没有符合条件的成员。</p>
          <button onClick={reset} className="mt-3 text-sm font-semibold text-signal underline-offset-4 hover:underline">
            清除筛选
          </button>
        </div>
      ) : (
        <motion.div layout className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <motion.div
              layout
              key={m.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
            >
              <MiniMemberCard m={m} faved={favs.includes(m.id)} onToggleFav={toggleFav} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0">
      <span className="w-12 shrink-0 text-sm font-semibold text-mist">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-all duration-150 cursor-pointer select-none active:scale-95",
        active
          ? "border-signal/50 bg-signal/15 font-semibold text-signal shadow-[0_0_12px_rgba(255,106,0,0.18)]"
          : "border-line bg-soft-surface text-mist hover:border-signal/40 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** 迷你名片：横幅 + 头像 + 昵称 + @handle + 粉丝量 + 赛道/标签 + Bio（纯真实数据，无称号等派生信息） */
function MiniMemberCard({ m, faved, onToggleFav }: { m: MemberStats; faved: boolean; onToggleFav: (id: string) => void }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lg hover:shadow-black/50">
      {/* 收藏钮：与整卡 Link 是兄弟，不嵌套（避免 a 内嵌 button） */}
      <button
        type="button"
        onClick={() => onToggleFav(m.id)}
        aria-pressed={faved}
        aria-label={faved ? "取消收藏" : "收藏"}
        title={faved ? "取消收藏" : "收藏"}
        className={cn(
          "absolute right-2.5 top-2.5 z-20 inline-flex size-8 cursor-pointer select-none items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-150 active:scale-90",
          faved
            ? "border-signal/50 bg-signal/20 text-signal shadow-[0_0_10px_rgba(255,106,0,0.25)]"
            : "border-white/15 bg-black/25 text-white/80 hover:bg-black/40 hover:text-white"
        )}
      >
        <span aria-hidden="true" className={cn("text-base leading-none", faved ? "" : "opacity-70")}>{faved ? "♥" : "♡"}</span>
      </button>
      <Link
        to="/members/$id"
        params={{ id: m.id }}
        className="flex h-full flex-col"
      >
        <div className="relative h-16 sm:h-20">
          {m.bannerUrl ? (
            <BannerImage src={m.bannerUrl} />
          ) : (
            <div aria-hidden="true" className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface" />
          )}
          <div aria-hidden="true" className="from-surface via-surface/30 absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>
        <div className="relative z-10 flex flex-1 flex-col px-4 pb-4">
          {/* z-10：横幅容器是定位元素会盖住静态兄弟，头像压边必须抬高一层 */}
          <div className="-mt-6">
            <Avatar url={m.profileImage} name={name} className="ring-surface size-12 ring-4" />
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight">{name}</span>
            {m.verified && <BadgeCheck className="size-4 shrink-0 text-sky-400" aria-label="X 认证账号" />}
          </div>
          <div className="mt-0.5 truncate text-xs text-mist">@{m.handle}</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</span>
            <span className="text-xs text-mist">粉丝</span>
          </div>
          {m.tracks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.tracks.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    t === "AI工具" ? "border-signal/40 bg-signal/10 text-signal" : "border-line bg-soft-surface text-ink"
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {m.tags.length > 0 && (
            <div className="mt-1.5 truncate text-xs text-mist">
              {m.tags.slice(0, 3).map((t) => `#${t}`).join("  ")}
            </div>
          )}
          {m.bio && <p className="text-mist mt-2 line-clamp-2 text-xs leading-relaxed">{m.bio}</p>}
        </div>
      </Link>
    </div>
  );
}