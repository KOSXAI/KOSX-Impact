import type { CommunityInsights, PostItem } from "@/stats";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { Eye, Heart, MessageCircle, PauseCircle, Tags } from "lucide-react";
import { fmtDate, postExcerpt } from "@/lib/format";

/**
 * 看板「内容洞察」：爆款帖（近 30 天单帖浏览 ≥5000 且 ≥ 本人均值×2）、
 * 疑似停更名单（近 14 天无新帖）、话题标签云（成员标签聚合）。
 * 三个分块首尾相衔，任一为空自动隐藏。
 */
export function InsightsSection({ insights }: { insights: CommunityInsights }) {
  const { viralPosts, inactiveMembers, tagCloud } = insights;
  if (viralPosts.length === 0 && inactiveMembers.length === 0 && tagCloud.length === 0) return null;

  return (
    <div className="mt-6 space-y-6 border-t border-line pt-6">
      {viralPosts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-mist">近 30 天爆款</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {viralPosts.map((p) => (
              <ViralCard key={p.tweetId} post={p} />
            ))}
          </div>
        </div>
      )}

      {tagCloud.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-mist">
            <span className="inline-flex items-center gap-1.5">
              <Tags className="size-3.5" aria-hidden="true" />
              社群话题标签
            </span>
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {tagCloud.map(({ tag, count }) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-soft-surface px-3 py-1 text-sm text-mist"
                title={`${count} 位成员打上此标签`}
              >
                #{tag}
                <b className="text-ink tabular-nums">{count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {inactiveMembers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-mist">
            <span className="inline-flex items-center gap-1.5">
              <PauseCircle className="size-3.5 text-signal-ink" aria-hidden="true" />
              疑似停更（近 14 天无新帖）
            </span>
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {inactiveMembers.slice(0, 12).map((m) => {
              const name = m.displayName ?? m.handle;
              return (
                <Link
                  key={m.memberId}
                  to="/members/$id"
                  params={{ id: m.memberId }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:bg-wash-strong hover:text-ink"
                >
                  {name}
                  <b className="text-ink tabular-nums">{m.days} 天</b>
                </Link>
              );
            })}
            {inactiveMembers.length > 12 && (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-sm text-mist">
                等 {inactiveMembers.length - 12} 位
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 爆款帖卡：作者 + 摘要 + 浏览/赞/评（与互动 Top 同视觉语言） */
function ViralCard({ post: p }: { post: PostItem }) {
  const name = p.member?.displayName ?? p.member?.handle ?? "?";
  return (
    <div className="group rounded-2xl border border-signal/25 bg-gradient-to-r from-signal/8 to-transparent px-3.5 py-3 transition-colors hover:bg-wash-strong">
      <div className="flex items-center gap-3">
        <Link to="/members/$id" params={{ id: p.member?.id ?? "" }} className="flex min-w-0 flex-1 items-center gap-3">
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
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-mist transition-colors group-hover:bg-wash-strong group-hover:text-signal-ink"
        >
          <Eye className="size-3.5" />
        </a>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-mist">{postExcerpt(p.text, 120) ?? "分享了一条链接"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
        <span className="inline-flex items-center gap-1 font-semibold text-signal-ink" title="浏览">
          <Eye className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{p.views ?? "—"}</span>
          <span className="sr-only">浏览</span>
        </span>
        <span className="inline-flex items-center gap-1" title="点赞">
          <Heart className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{p.likes != null ? p.likes : "—"}</span>
          <span className="sr-only">点赞</span>
        </span>
        <span className="inline-flex items-center gap-1" title="评论">
          <MessageCircle className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{p.replies != null ? p.replies : "—"}</span>
          <span className="sr-only">评论</span>
        </span>
      </div>
    </div>
  );
}