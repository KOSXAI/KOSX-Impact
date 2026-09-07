import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchTopPosts } from "@/data.functions";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowLeft, ExternalLink, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/posts")({
  loader: () => fetchTopPosts(),
  head: () => ({
    meta: [
      { title: `精华帖 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME} 社群近 30 天单帖浏览 Top——看看大家都在聊什么、什么内容最受欢迎。` },
      { property: "og:title", content: `精华帖 · ${SITE_NAME}` },
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
  const posts = Route.useLoaderData();
  const now = new Date();
  const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <SiteHeader containerClassName="max-w-4xl" />
      <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            返回看板
          </Link>
          <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">精华帖</h1>
          <p className="mt-3 text-mist">
            {monthLabel} · 全社群近 30 天单帖浏览 Top，看什么内容最受欢迎
          </p>
        </Reveal>

        <main className="mt-10 space-y-3">
          {posts.length === 0 && <p className="text-mist">近 30 天还没有帖子数据。</p>}
          {posts.map((p, i) => {
            const name = p.member?.displayName ?? p.member?.handle ?? "?";
            const isPodium = i < 3;
            const P = [
              { rankNum: "from-amber-300 to-amber-600", ring: "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent" },
              { rankNum: "from-slate-300 to-slate-500", ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent" },
              { rankNum: "from-orange-400 to-orange-700", ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent" },
            ];
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
      </div>
    </>
  );
}
