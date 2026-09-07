import type { PostItem } from "@/stats";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { AnimatedNumber } from "@/components/motion";
import { ExternalLink, Eye, Heart, MessageCircle } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";

/** 看板「互动 Top」：全社群单帖浏览 Top 8（点成员头像/名字进档案，点行内原文外链进 X） */
export function TopPosts({ posts }: { posts: PostItem[] }) {
  if (posts.length === 0) return null;
  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="text-sm font-semibold text-mist">单帖浏览 Top 8</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {posts.map((p) => {
          const name = p.member?.displayName ?? p.member?.handle ?? "?";
          return (
            <div
              key={p.tweetId}
              className="group rounded-2xl border border-line bg-soft-surface px-3.5 py-3 transition-colors hover:border-signal/40"
            >
              <div className="flex items-start gap-3">
                <Link
                  to="/members/$id"
                  params={{ id: p.member?.id ?? "" }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar url={p.member?.profileImage ?? null} name={name} className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <div className="mt-0.5 text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</div>
                  </div>
                </Link>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="查看 X 原文"
                  title="查看 X 原文"
                  className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-mist transition-colors group-hover:border-signal/40 group-hover:text-signal"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-mist">{p.text ?? "（无正文）"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
                <span className="inline-flex items-center gap-1 font-semibold text-signal" title="浏览">
                  <Eye className="size-3.5" />
                  <AnimatedNumber value={p.views ?? 0} />
                </span>
                <span className="inline-flex items-center gap-1" title="点赞">
                  <Heart className="size-3.5" />
                  <span className="tabular-nums">{p.likes != null ? fmt(p.likes) : "—"}</span>
                </span>
                <span className="inline-flex items-center gap-1" title="评论">
                  <MessageCircle className="size-3.5" />
                  <span className="tabular-nums">{p.replies != null ? fmt(p.replies) : "—"}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}