import type { PostActivity as PostActivityData } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/ui/Metric";
import { AnimatedNumber, Reveal } from "@/components/motion";
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { fmtDate, postExcerpt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 成员页「帖子活跃度」：近 20 帖的浏览/赞/评论合计 + 帖子列表（摘要 + 原文外链） */
export function PostActivity({ activity }: { activity: PostActivityData }) {
  return (
    <Reveal>
      <section>
        <h2 className="text-2xl font-bold">帖子活跃度</h2>
        <Card className="card-lift mt-6">
          <CardContent className="p-6 sm:p-8">
            {/* 聚合指标：近 20 帖的浏览 / 赞 / 评论合计 */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "近 20 帖浏览", value: activity.totalViews },
                { label: "近 20 帖点赞", value: activity.totalLikes },
                { label: "近 20 帖评论", value: activity.totalReplies },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-sm text-mist">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    <AnimatedNumber value={s.value} />
                  </div>
                </div>
              ))}
            </div>

            {/* 帖子列表：日期 + 两行摘要 + 互动指标 + 原文外链，不搬运全文 */}
            <ul className="mt-6 space-y-3 border-t border-line pt-6">
              {activity.posts.map((p) => (
                <li key={p.tweetId}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-2xl bg-soft-surface px-4 py-3 transition-colors hover:bg-wash-strong hover:bg-soft-surface/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</div>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed">
                        {postExcerpt(p.text, 120) ?? "分享了一条链接"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <Metric icon={<Eye className="size-3.5" />} value={p.views} label="浏览" />
                        <Metric icon={<Heart className="size-3.5" />} value={p.likes} label="点赞" />
                        <Metric icon={<MessageCircle className="size-3.5" />} value={p.replies} label="评论" />
                        <Metric icon={<Repeat2 className="size-3.5" />} value={p.retweets} label="转推" />
                      </div>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-mist transition-colors",
                        "group-hover:bg-wash-strong group-hover:text-signal-ink"
                      )}
                    >
                      原文
                      <ExternalLink className="size-3" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </Reveal>
  );
}