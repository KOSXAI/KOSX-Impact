import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { computeWeeklyReport, weeklyShareText } from "@/weekly";
import { NotFound } from "@/components/NotFound";
import { Avatar } from "@/components/member/Avatar";
import { GrowProgress } from "@/components/motion";
import { StatCard } from "@/components/ui/StatCard";
import { Check, Copy, Flag, Heart, MessageCircle, PauseCircle, Trophy, Eye } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { titleOf } from "@/milestones";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/_shell/_reports/reports/$memberId")({
  loader: async ({ params }) => {
    const detail = await fetchMemberDetail({ data: params.memberId });
    // 不存在的成员直接 404（此前返回 200 + 「不在追踪名单」，属于软 404）
    if (!detail) throw notFound();
    const report = computeWeeklyReport({
      member: detail.member,
      snapshots: detail.snapshots,
      milestones: detail.milestones,
      posts30d: detail.posts30d,
      handle: detail.member.handle,
      tracks: detail.member.tracks,
      tags: detail.member.tags,
      now: new Date().toISOString(),
    });
    return { report };
  },
  head: ({ loaderData, params }) => {
    const r = loaderData?.report ?? null;
    const name = r ? (r.displayName ?? `@${r.handle}`) : "成员不存在";
    const title = `${name} 的内容周报 · ${SITE_NAME}`;
    return {
      meta: [
        { title },
        ...(r
          ? [{ name: "description", content: `${name} 近 7 天的涨粉、登阶与最热内容周报，每周自动生成。` }]
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: title },
        { property: "og:description", content: r ? `${name} 近 7 天的涨粉、登阶与最热内容。` : "成员周报" },
        { property: "og:type", content: "website" },
        ...(r
          ? [
              { property: "og:url", content: `${SITE_URL}/reports/${params.memberId}` },
              // 周报专属 OG 分享卡（PNG，端点已存在）
              { property: "og:image", content: `${SITE_URL}/og/reports/${r.memberId}.png?v=1` },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${SITE_URL}/og/reports/${r.memberId}.png?v=1` },
            ]
          : []),
      ],
      ...(r ? { links: [{ rel: "canonical", href: `${SITE_URL}/reports/${r.memberId}` }] } : {}),
    };
  },
  component: ReportPage,
  notFoundComponent: () => <NotFound title="这位成员不在追踪名单里" description="去成员广场看看其他成员的周报。" />,
});

function ReportPage() {
  const { report } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);

  const name = report.displayName ?? `@${report.handle}`;
  const nextTitle = titleOf(report.nextMilestone);
  const shareText = `${weeklyShareText(report)} ${SITE_URL}/reports/${report.memberId}`;

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  return (
    <>
      <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Avatar url={report.profileImage} name={name} className="size-14 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
              <a
                href={`https://x.com/${encodeURIComponent(report.handle)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
              >
                @{report.handle}
              </a>
            </div>
            <p className="mt-0.5 text-sm text-mist">
              内容周报 · 近 7 天（{fmtDate(report.windowStart)} ~ {fmtDate(report.windowEnd)}）
            </p>
          </div>
          <button
            onClick={copyShare}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
            title="复制周报文案"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "已复制" : "复制周报"}
          </button>
        </div>

        {/* 数据卡 */}
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="本周增长" value={`+${fmt(report.growth)}`} hint={report.growthPct != null ? `+${Math.round(report.growthPct * 100)}%` : undefined} highlight={report.growth > 0} />
          <StatCard label="当前粉丝" value={fmt(report.followersEnd)} />
          <StatCard label="本周发帖" value={`${report.postCount} 条`} />
          <StatCard
            label="互动率中位数"
            value={report.engagementMedian != null ? `${Math.round(report.engagementMedian * 10000) / 100}%` : "—"}
          />
        </div>

        {/* 称号进度 */}
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">称号之路</h2>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <span className="text-sm text-mist">当前「{titleOf(report.prevMilestone)}」</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-signal">
              <Flag className="size-3.5" aria-hidden="true" />
              下一关「{nextTitle}」
            </span>
          </div>
          <GrowProgress value={report.progressToNext} className="mt-2.5 h-2" ariaLabel={`距「${nextTitle}」进度 ${report.progressToNext}%`} />
          <div className="mt-2 flex justify-between text-xs text-mist tabular-nums">
            <span>{fmt(report.prevMilestone)}</span>
            <span>{fmt(report.nextMilestone)}</span>
          </div>
          <p className="mt-3 text-sm text-mist tabular-nums">
            还差 <b className="text-ink">{fmt(Math.max(0, report.nextMilestone - report.followersEnd))}</b> 粉
          </p>
        </section>

        {/* 本周登阶 */}
        {report.milestoneAchieved && (
          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-signal/20 bg-signal/8 px-5 py-4">
            <span>🎉 本周拿下称号「{titleOf(report.milestoneAchieved.threshold)}」</span>
            <span className="text-sm text-mist tabular-nums">（{fmtDate(report.milestoneAchieved.achievedAt)}）</span>
          </div>
        )}

        {/* 停更警告 */}
        {report.inactive && (
          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-soft-surface px-5 py-4 text-sm text-mist">
            <PauseCircle className="size-4 text-signal" aria-hidden="true" />
            已 <b className="text-ink tabular-nums">{report.inactiveDays}</b> 天没有新内容
          </div>
        )}

        {/* 本周内容表现 */}
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">本周内容</h2>
          {report.topPosts.length === 0 ? (
            <p className="mt-4 text-sm text-mist">这周还没有帖子数据，采集跑起来后自动出现。</p>
          ) : (
            <ol className="mt-4 space-y-2.5">
              {report.topPosts.map((p, i) => {
                const viral = report.virals.some((v) => v.tweetId === p.tweetId);
                return (
                  <li key={p.tweetId} className="rounded-2xl border border-line bg-soft-surface px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface text-xs font-bold text-mist tabular-nums">{i + 1}</span>
                      <span className="text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</span>
                      {viral && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 text-xs font-semibold text-signal">
                          <Trophy className="size-3" aria-hidden="true" />
                          爆款
                        </span>
                      )}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-mist underline-offset-4 hover:text-ink hover:underline"
                      >
                        查看原文
                      </a>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-mist">{p.text ?? "（无正文）"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
                      <span className="inline-flex items-center gap-1 font-semibold text-signal" title="浏览">
                        <Eye className="size-3.5" aria-hidden="true" />
                        <span className="tabular-nums">{p.views ?? "—"}</span>
                        <span className="sr-only">浏览</span>
                      </span>
                      <span className="inline-flex items-center gap-1" title="点赞">
                        <Heart className="size-3.5" aria-hidden="true" />
                        <span className="tabular-nums">{p.likes ?? "—"}</span>
                        <span className="sr-only">点赞</span>
                      </span>
                      <span className="inline-flex items-center gap-1" title="评论">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        <span className="tabular-nums">{p.replies ?? "—"}</span>
                        <span className="sr-only">评论</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <Link to="/members/$id" params={{ id: report.memberId }} className={cn("inline-flex items-center gap-1 text-sm font-semibold text-signal underline-offset-4 hover:underline")}>
              查看完整档案与成长曲线 →
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

