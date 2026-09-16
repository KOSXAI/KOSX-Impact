import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchInsights, fetchTopPosts, fetchTopPostsAll, fetchCommunitySignals, fetchContentRecipe } from "@/data.functions";
import type { PostItem } from "@/stats";
import { engagementRate } from "@/insights";
import { Avatar } from "@/components/member/Avatar";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { PostBody } from "@/components/content/PostText";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/skeleton";
import { Metric } from "@/components/ui/Metric";
import { PODIUM } from "@/components/leaderboard/podium";
import { ExternalLink, Eye, Heart, MessageCircle, Percent, Repeat2, Users, TrendingUp } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import {
  POST_FILTERS,
  POST_SORTS,
  countByPostFilter,
  matchesPostFilter,
  sortPosts,
  type PostFilterKey,
  type PostSortKey,
  RATE_MIN_VIEWS,
} from "@/lib/post-filters";
import { SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/posts")({
  loader: async () => {
    // insights 用独立轻量缓存（爆款/停更/标签云），不连带拉整份 dashboard。
    // 全站历史帖池不在这里预取：它默认不展示（scope 默认 30d），
    // 却带着 media/quoted JSON 大字段一起进 SSR payload——改由切到「全站历史」时按需取。
    const [insights, posts, signals, recipe] = await Promise.all([
      fetchInsights(),
      fetchTopPosts(),
      fetchCommunitySignals(),
      fetchContentRecipe(),
    ]);
    return { insights, posts, signals, recipe };
  },
  head: () => ({
    meta: [
      { title: `内容 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME} 社群内容：爆款帖、话题标签、停更检测 + 近 30 天单帖浏览 Top——看看大家都在聊什么、什么内容最受欢迎。` },
      { property: "og:title", content: `内容 · ${SITE_NAME}` },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/posts` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/posts` }],
  }),
  component: PostsPage,
});

/** 帖子行内指标：图标 + 数值（共享 Metric 组件，读屏可念出指标名） */

function PostsPage() {
  const { insights, posts, signals, recipe } = Route.useLoaderData();
  const [scope, setScope] = useState<"30d" | "all">("30d");
  const [filter, setFilter] = useState<PostFilterKey>("all");
  const [sort, setSort] = useState<PostSortKey>("views");
  // 全站历史池按需加载：初次切到「全站历史」时才请求（走服务端缓存查询层），拿到前显示骨架
  const [allPosts, setAllPosts] = useState<PostItem[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  const openAllTime = async () => {
    setScope("all");
    setFilter("all");
    setSort("views");
    if (allPosts || loadingAll) return;
    setLoadingAll(true);
    try {
      setAllPosts(await fetchTopPostsAll());
    } finally {
      setLoadingAll(false);
    }
  };

  const following = signals
    .filter((s) => s.kind === "following")
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const taste = signals
    .filter((s) => s.kind === "taste")
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const pool = scope === "30d" ? posts : (allPosts ?? []);
  const counts = countByPostFilter(pool);
  const visible = sortPosts(pool.filter((p) => matchesPostFilter(p, filter)), sort);

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">内容</h1>
        </Reveal>

        {/* 内容洞察：爆款帖 / 社群话题标签 / 疑似停更（任一为空整体隐藏） */}
        {(insights.viralPosts.length > 0 ||
          insights.inactiveMembers.length > 0 ||
          insights.tagCloud.length > 0) && (
          <Reveal delay={0.06}>
            <section className="mt-8 panel-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">内容洞察</h2>
              <InsightsSection insights={insights} />
            </section>
          </Reveal>
        )}

        {/* 内容配方：社群黄金时段 + 什么形态最吃香（近 30 天帖子聚合） */}
        {recipe && (recipe.hours.length > 0 || recipe.forms.length > 0) && (
          <Reveal delay={0.07}>
            <section className="mt-8 panel-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">内容配方</h2>
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {recipe.hours.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-mist">社群黄金时段</div>
                    <ul className="mt-3 space-y-2">
                      {recipe.hours.map((h) => (
                        <li key={h.hour} className="flex items-center gap-3 rounded-xl bg-soft-surface px-3 py-2">
                          <span className="w-14 shrink-0 font-bold tabular-nums">{String(h.hour).padStart(2, "0")}:00</span>
                          <span className="text-xs text-mist tabular-nums">{h.count} 帖</span>
                          <span className="ml-auto text-sm font-bold text-signal-ink tabular-nums">{fmt(h.avgViews)}</span>
                          <span className="text-xs text-mist">平均曝光</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {recipe.forms.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-mist">什么形态最吃香</div>
                    <ul className="mt-3 space-y-2">
                      {recipe.forms.map((f) => (
                        <li key={f.label} className="flex items-center gap-3 rounded-xl bg-soft-surface px-3 py-2">
                          <span className="w-16 shrink-0 font-bold">{f.label}</span>
                          <span className="text-xs text-mist tabular-nums">{f.count} 帖</span>
                          <span className="ml-auto text-sm font-bold tabular-nums">{fmt(f.avgViews)}</span>
                          <span className="text-xs text-mist">平均曝光</span>
                          <span className="w-14 shrink-0 text-right text-xs font-semibold text-signal-ink tabular-nums">
                            {f.engagementRate != null ? `${(f.engagementRate * 100).toFixed(1)}%` : "—"}
                          </span>
                          <span className="text-xs text-mist">互动率</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </Reveal>
        )}

        {/* 社群品味策展：成员们共同关注的大V + 社群帖子中热议的外部账号 */}
        {(following.length > 0 || taste.length > 0) && (
          <Reveal delay={0.07}>
            <section className="mt-8 panel-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">社群品味</h2>
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {following.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-mist">
                      <Users className="size-4" aria-hidden="true" />
                      成员们共同关注
                    </div>
                    <ul className="mt-3 space-y-2">
                      {following.map((s) => (
                        <li key={s.handle}>
                          <a href={xProfileUrl(s.handle)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-soft-surface px-3 py-2 transition-colors hover:bg-wash-strong">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name ?? `@${s.handle}`}</span>
                            <span className="truncate text-xs text-mist">@{s.handle}</span>
                            <b className="shrink-0 text-xs text-signal-ink tabular-nums">{s.count} 人</b>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {taste.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-mist">
                      <TrendingUp className="size-4" aria-hidden="true" />
                      社群最近热议
                    </div>
                    <ul className="mt-3 space-y-2">
                      {taste.map((s) => (
                        <li key={s.handle}>
                          <a href={xProfileUrl(s.handle)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-soft-surface px-3 py-2 transition-colors hover:bg-wash-strong">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">@{s.handle}</span>
                            <b className="shrink-0 text-xs text-signal-ink tabular-nums">被提 {s.count} 次</b>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </Reveal>
        )}

        {/* 精华帖：近 30 天 / 全站历史 Top 切换 */}
        <Reveal delay={0.08}>
          <section className="mt-8 panel-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{scope === "30d" ? "精华帖" : "历史 Top 帖"}</h2>
              <SegmentedControl
                value={scope}
                onChange={(s) => {
                  if (s === "all") {
                    void openAllTime();
                  } else {
                    setScope(s);
                    setFilter("all");
                    setSort("views");
                  }
                }}
                options={[
                  { key: "30d" as const, label: "近 30 天" },
                  { key: "all" as const, label: "全站历史" },
                ]}
                size="md"
                ariaLabel="精华帖时间范围"
              />
            </div>
            {/* 形态筛选 + 排序：客户端过滤（池子 50 帖），0 命中的形态不展示 chip */}
            {pool.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {POST_FILTERS.map((f) => {
                  const n = counts[f.key];
                  if (f.key !== "all" && n === 0) return null;
                  const active = f.key === filter;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                        active ? "bg-primary text-primary-foreground" : "bg-soft-surface text-mist hover:text-ink"
                      )}
                    >
                      {f.label}
                      <b className={cn("text-xs tabular-nums", active ? "opacity-90" : "opacity-70")}>{n}</b>
                    </button>
                  );
                })}
                <span title={sort === "rate" ? `互动率仅统计浏览 ≥ ${RATE_MIN_VIEWS} 的帖子` : undefined} className="ml-auto">
                  <SegmentedControl value={sort} onChange={setSort} options={POST_SORTS} size="sm" ariaLabel="精华帖排序" />
                </span>
              </div>
            )}
            {scope === "all" && loadingAll ? (
              <div className="mt-5 space-y-3" aria-busy="true" aria-label="全站历史帖加载中">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : scope === "all" && (allPosts?.length ?? 0) === 0 ? (
              <p className="mt-5 text-mist">全站历史数据还在采集中，跑满一个采集周期后自动展示。</p>
            ) : (
              <PostList posts={visible} showRate={sort === "rate"} />
            )}
          </section>
        </Reveal>
      </div>
    </>
  );
}

function PostList({ posts, showRate = false }: { posts: PostItem[]; showRate?: boolean }) {
  if (posts.length === 0) return <p className="mt-5 text-mist">这个筛选下暂无帖子，换个形态或切回全部。</p>;
  return (
    <main className="mt-5 space-y-3">
      {/* 错峰入场用 RevealGroup/RevealItem：逐个 <Reveal> 会让每行各建一个
          matchMedia 监听与 IntersectionObserver（50 行 = 100 个 effect + 50 次
          挂载后重渲染）；RevealItem 不涉及那套 hook，只吃父级 variants */}
      <RevealGroup stagger={0.04}>
        {posts.map((p, i) => {
          const name = p.member?.displayName ?? p.member?.handle ?? "?";
          const podium = PODIUM[i];
          return (
            <RevealItem key={p.tweetId} y={14}>
              <article
                className={cn(
                  "p-4 sm:p-5",
                  podium ? `card-lift rounded-2xl bg-surface ${podium.ring}` : "panel-card"
                )}
              >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-7 shrink-0 text-center font-extrabold tabular-nums",
                    podium ? "bg-gradient-to-br bg-clip-text text-transparent" : "text-mist",
                    podium?.rankNum
                  )}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      to="/members/$id"
                      params={{ id: p.member?.id ?? "" }}
                      className="flex items-center gap-2 font-semibold underline-offset-4 hover:underline"
                    >
                      <Avatar url={p.member?.profileImage ?? null} name={name} className="size-6" />
                      {name}
                    </Link>
                    <span className="text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</span>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-mist underline-offset-4 hover:text-signal-ink hover:underline"
                    >
                      X 原文
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <PostBody post={p} className="mt-2" />
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    <Metric icon={<Eye className="size-3.5" />} value={p.views} label="浏览" />
                    <Metric icon={<Heart className="size-3.5" />} value={p.likes} label="点赞" />
                    <Metric icon={<MessageCircle className="size-3.5" />} value={p.replies} label="评论" />
                    <Metric icon={<Repeat2 className="size-3.5" />} value={p.retweets} label="转推" />
                    {/* 互动率排序时逐帖亮出比率，排序才可验证 */}
                    {showRate && (() => {
                      const r = engagementRate(p);
                      return r == null ? null : (
                        <span className="inline-flex items-center gap-1 font-semibold text-signal-ink" title="互动率">
                          <Percent className="size-3.5" aria-hidden="true" />
                          <span className="tabular-nums">{(r * 100).toFixed(1)}%</span>
                          <span className="sr-only">互动率</span>
                        </span>
                      );
                    })()}
                  </div>
                  </div>
                </div>
              </article>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </main>
  );
}