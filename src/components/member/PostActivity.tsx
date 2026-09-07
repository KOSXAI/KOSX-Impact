import type { PostActivity as PostActivityData } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber, Reveal } from "@/components/motion";
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 互动小指标：图标 + 数值（浏览/赞/评论/转推），数值缺失显示 — */
function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | null;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-mist" title={label}>
      {icon}
      <span className="tabular-nums">{value != null ? fmt(value) : "—"}</span>
    </span>
  );
}

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
                    className="group flex items-start gap-3 rounded-2xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40 hover:bg-soft-surface/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</div>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed">
                        {p.text ?? "（无正文）"}
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
                        "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-mist transition-colors",
                        "group-hover:border-signal/40 group-hover:text-signal"
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