import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard, fetchTopPosts, fetchTopPostsAll, fetchCommunitySignals } from "@/data.functions";
import type { PostItem } from "@/stats";
import { Avatar } from "@/components/member/Avatar";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { Reveal } from "@/components/motion";
import { SiteHeader } from "@/components/SiteHeader";
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2, Users, TrendingUp } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/posts")({
  loader: async () => {
    const [stats, posts, allPosts, signals] = await Promise.all([
      fetchDashboard(),
      fetchTopPosts(),
      fetchTopPostsAll(),
      fetchCommunitySignals(),
    ]);
    return { insights: stats.insights, posts, allPosts, signals };
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
  }),
  component: PostsPage,
});

/** 帖子行内指标：图标 + 数值 */
function Metric({ icon, value, label }: { icon: React.ReactNode; value: number | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-mist" title={label}>
      {icon}
      <span className="tabular-nums">{value != null ? fmt(value) : "—"}</span>
    </span>
  );
}

function PostsPage() {
  const { insights, posts, allPosts, signals } = Route.useLoaderData();
  const [scope, setScope] = useState<"30d" | "all">("30d");
  const following = signals
    .filter((s) => s.kind === "following")
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const taste = signals
    .filter((s) => s.kind === "taste")
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">内容</h1>
        </Reveal>

        {/* 内容洞察：爆款帖 / 社群话题标签 / 疑似停更（任一为空整体隐藏） */}
        {(insights.viralPosts.length > 0 ||
          insights.inactiveMembers.length > 0 ||
          insights.tagCloud.length > 0) && (
          <Reveal delay={0.06}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">内容洞察</h2>
              <InsightsSection insights={insights} />
            </section>
          </Reveal>
        )}

        {/* 社群品味策展：成员们共同关注的大V + 社群帖子中热议的外部账号 */}
        {(following.length > 0 || taste.length > 0) && (
          <Reveal delay={0.07}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">社群品味</h2>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                {following.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-mist">
                      <Users className="size-4" aria-hidden="true" />
                      成员们共同关注
                    </div>
                    <ul className="mt-3 space-y-2">
                      {following.map((s) => (
                        <li key={s.handle}>
                          <a href={xProfileUrl(s.handle)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name ?? `@${s.handle}`}</span>
                            <span className="truncate text-xs text-mist">@{s.handle}</span>
                            <b className="shrink-0 text-xs text-signal tabular-nums">{s.count} 人</b>
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
                          <a href={xProfileUrl(s.handle)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">@{s.handle}</span>
                            <b className="shrink-0 text-xs text-signal tabular-nums">被提 {s.count} 次</b>
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
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{scope === "30d" ? "精华帖" : "历史 Top 帖"}</h2>
              <div className="flex gap-1 rounded-full border border-line bg-soft-surface p-1">
                {([["30d", "近 30 天"], ["all", "全站历史"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setScope(key)}
                    className={cn(
                      "h-8 cursor-pointer select-none rounded-full px-4 text-sm font-semibold transition-colors",
                      scope === key ? "bg-white text-paper" : "text-mist hover:text-ink"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <PostList posts={scope === "30d" ? posts : scope === "all" && allPosts.length > 0 ? allPosts : posts} />
          </section>
        </Reveal>
      </div>
    </>
  );
}

function PostList({ posts }: { posts: PostItem[] }) {
  if (posts.length === 0) return <p className="mt-5 text-mist">还没有帖子数据。</p>;
  const P = [
    { rankNum: "from-amber-300 to-amber-600", ring: "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent" },
    { rankNum: "from-slate-300 to-slate-500", ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent" },
    { rankNum: "from-orange-400 to-orange-700", ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent" },
  ];
  return (
    <main className="mt-5 space-y-3">
      {posts.map((p, i) => {
        const name = p.member?.displayName ?? p.member?.handle ?? "?";
        const isPodium = i < 3;
        const podium = isPodium ? P[i] : undefined;
        return (
          <Reveal key={p.tweetId} delay={Math.min(i * 0.04, 0.3)} y={14}>
            <article
              className={cn(
                "p-4 sm:p-5",
                podium ? `card-lift rounded-2xl border ${podium.ring}` : "rounded-2xl border border-line bg-surface"
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
                      className="inline-flex items-center gap-1 text-xs text-mist underline-offset-4 hover:text-signal hover:underline"
                    >
                      X 原文
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{p.text ?? "（无正文）"}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    <Metric icon={<Eye className="size-3.5" />} value={p.views} label="浏览" />
                    <Metric icon={<Heart className="size-3.5" />} value={p.likes} label="点赞" />
                    <Metric icon={<MessageCircle className="size-3.5" />} value={p.replies} label="评论" />
                    <Metric icon={<Repeat2 className="size-3.5" />} value={p.retweets} label="转推" />
                  </div>
                </div>
              </div>
            </article>
          </Reveal>
        );
      })}
    </main>
  );
}