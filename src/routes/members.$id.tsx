import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { ProfileHero } from "@/components/member/ProfileHero";
import { MilestoneJourney } from "@/components/member/MilestoneJourney";
import { ContentInsights } from "@/components/member/ContentInsights";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { ShareDialog } from "@/components/member/ShareDialog";
import { PostActivity } from "@/components/member/PostActivity";
import { InfluenceCard } from "@/components/member/InfluenceCard";
import { FanProfileCard } from "@/components/member/FanProfileCard";
import { SimilarAccountsCard } from "@/components/member/SimilarAccountsCard";
import { fmt, fmtDate } from "@/lib/format";
import { nextThreshold } from "@/milestones";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/members/$id")({
  loader: async ({ params }) => {
    const detail = await fetchMemberDetail({ data: params.id });
    if (!detail) throw notFound();
    return detail;
  },
  // 404 时 loaderData 为空：标题降级为「成员不存在」，并输出 noindex
  // 让搜索引擎丢弃软 404（SSR 状态码已是 HTTP 404，noindex 兜底防重复抓取）
  head: ({ loaderData }) => {
    const name = loaderData ? loaderData.member.displayName ?? loaderData.member.handle : "成员不存在";
    // 简介是成员的自我介绍：有就拿来当分享描述，没有退回站点文案
    const blurb = loaderData?.profile.bio?.trim() || `${name} 的成长档案：粉丝量曲线、称号大关与成就徽章。`;
    return {
      meta: [
        { title: `${name} · ${SITE_NAME}` },
        ...(loaderData
          ? [{ name: "description", content: blurb }]
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: `${name} · ${SITE_NAME}` },
        { property: "og:description", content: blurb },
        { property: "og:type", content: "profile" },
        ...(loaderData
          ? [
              { property: "og:url", content: `${SITE_URL}/members/${loaderData.member.id}` },
              // 分享预览卡（PNG）：X/微信不渲染 SVG 的 og:image
              // ?v= 换代让 X/微信重抓预览图（平台按完整 URL 缓存，同 URL 不再回源）
              { property: "og:image", content: `${SITE_URL}/og/members/${loaderData.member.id}.png?v=2` },
              { property: "og:image:alt", content: `${name} 的 KOSX 影响力卡片` },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${SITE_URL}/og/members/${loaderData.member.id}.png?v=2` },
            ]
          : []),
      ],
    };
  },
  component: MemberPage,
  notFoundComponent: () => <MemberNotFound id="" />,
});

function MemberPage() {
  const { member, profile, counters, snapshots, milestones, postActivity, posts30d, influence, insights, fanProfile, similarAccounts, neighbors, fanCircle } = Route.useLoaderData();
  const name = member.displayName ?? member.handle;
  const [submitOpen, setSubmitOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // ETA：近 7 天增速优先（更新鲜），为零/为负退 30 天；都停滞则不预估
  const remaining = Math.max(0, member.nextMilestone - (member.latestFollowers ?? 0));
  const dailyRate = member.growth7d > 0 ? member.growth7d / 7 : member.growth30d / 30;
  const etaDays = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;

  // 接下来 4 道大关的称号路线（下一枚成就起）
  const upcoming: number[] = [];
  let t = member.nextMilestone;
  for (let i = 0; i < 4; i++) {
    upcoming.push(t);
    t = nextThreshold(t);
  }

  // 次级计数：关注 / 发帖 / 列表收录 / 点赞（近 30 天增量有值才显示）
  const secondary: Array<{ label: string; value: number | null; delta?: number | null }> = [
    { label: "关注", value: counters.following, delta: counters.delta30d.following },
    { label: "发帖", value: counters.posts, delta: counters.delta30d.posts },
    { label: "列表收录", value: counters.listedCount, delta: counters.delta30d.listedCount },
    { label: "点赞", value: counters.favouritesCount, delta: counters.delta30d.favouritesCount },
  ];
  // 加入天数（成长档案摘要）
  const daysJoined = Math.max(0, Math.floor((Date.now() - Date.parse(member.joinedAt)) / 86_400_000));

  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <ProfileHero
            member={member}
            profile={profile}
            insights={insights}
            neighbors={neighbors}
            onShare={() => setShareOpen(true)}
          />
        </Reveal>

        <main className="mt-10 space-y-12 sm:mt-14">
          <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
            <RevealItem>
              <Stat label="当前粉丝" value={member.latestFollowers ?? 0} />
            </RevealItem>
            <RevealItem>
              <Stat label="近 7 天增长" value={member.growth7d} prefix={member.growth7d > 0 ? "+" : ""} />
            </RevealItem>
            <RevealItem>
              <Stat label="近 30 天增长" value={member.growth30d} prefix={member.growth30d > 0 ? "+" : ""} />
            </RevealItem>
            <RevealItem>
              <Stat label="登阶成就" value={milestones.length} />
            </RevealItem>
          </RevealGroup>

          {/* 次级计数：同一份采集响应带出的公开数据（快照无值显示 —） */}
          <Reveal>
            <Card>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-4 sm:grid-cols-4">
                {secondary.map((s) => (
                  <div key={s.label}>
                    <div className="text-sm text-mist">{s.label}</div>
                    <div className="mt-1 text-xl font-bold tabular-nums">
                      {s.value != null ? fmt(s.value) : "—"}
                    </div>
                    {s.value != null && s.delta != null && (
                      <div className={cn("mt-0.5 text-xs text-mist tabular-nums", s.delta > 0 && "text-signal")}>
                        近 30 天 {s.delta > 0 ? "+" : ""}
                        {fmt(s.delta)}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </Reveal>

          {/* 帖子活跃度：近 20 帖的浏览/赞/评论汇总（帖子表有数据才显示） */}
          {postActivity && (
            <>
              {insights && insights.virals.length > 0 && (
                <Reveal>
                  <div className="flex flex-wrap gap-2">
                    {insights.virals.map((v) => (
                      <a
                        key={v.tweetId}
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-sm font-semibold text-signal transition-colors hover:border-signal/50"
                        title={`${fmtDate(v.createdAt)} · 浏览 ${v.views ?? "—"}`}
                      >
                        <Trophy className="size-3.5" aria-hidden="true" />
                        近 30 天爆款
                        <span className="tabular-nums">{v.views ?? ""}</span>
                      </a>
                    ))}
                  </div>
                </Reveal>
              )}
              <PostActivity activity={postActivity} />
            </>
          )}

          {/* 影响力指数：综合分 + 有效粉丝 + 四维分项（近 30 天帖子数据） */}
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">影响力指数</h2>
              <div className="mt-6">
                <InfluenceCard influence={influence} />
              </div>
            </section>
          </Reveal>

          {/* 内容密码：黄金时段 / 爆款涨粉归因 / 最有讨论度——从已有帖子+快照数据挖出来的实用洞察 */}
          {posts30d.length > 0 && (
            <Reveal>
              <ContentInsights posts={posts30d} snapshots={snapshots} />
            </Reveal>
          )}

          {/* 粉丝圈画像：粉丝样本质量指标（月度刷新） */}
          <Reveal>
            <section>
              <FanProfileCard fanProfile={fanProfile} />
            </section>
          </Reveal>

          {/* 相似账号 */}
          <Reveal>
            <section>
              <SimilarAccountsCard accounts={similarAccounts} />
            </section>
          </Reveal>

          {/* 同赛道伙伴：按粉丝量排名的同赛道成员（零成本网络推荐） */}
          {neighbors && neighbors.members.length > 0 && (
            <Reveal>
              <section>
                <h2 className="text-2xl font-bold">同赛道伙伴</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {neighbors.members.map((n) => (
                    <Link
                      key={n.id}
                      to="/members/$id"
                      params={{ id: n.id }}
                      className="card-lift flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-signal/40"
                    >
                      <Avatar url={n.profileImage} name={n.displayName ?? n.handle} className="size-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{n.displayName ?? n.handle}</div>
                        <div className="truncate text-xs text-mist">@{n.handle}</div>
                      </div>
                      <div className="shrink-0 text-sm font-bold tabular-nums">
                        {n.followers != null ? fmt(n.followers) : "—"}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {/* 同粉丝圈：粉丝样本重叠度最高的伙伴（采样重叠） */}
          {fanCircle && fanCircle.length > 0 && (
            <Reveal>
              <section>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">同粉丝圈</h2>
                  <span className="rounded-full border border-line bg-soft-surface px-2.5 py-0.5 text-xs font-semibold text-mist">粉丝样本重叠</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {fanCircle.map((n) => (
                    <Link
                      key={n.id}
                      to="/members/$id"
                      params={{ id: n.id }}
                      className="card-lift flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-signal/40"
                    >
                      <Avatar url={n.profileImage} name={n.displayName ?? n.handle} className="size-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{n.displayName ?? n.handle}</div>
                        <div className="truncate text-xs text-mist">@{n.handle}</div>
                      </div>
                      <div className="shrink-0 text-sm text-signal tabular-nums">{n.overlap} 人重合</div>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          )}

          {/* 称号之路四连区块：称号之路 / 成长曲线 / 成就徽章 / 成长档案 */}
          <MilestoneJourney
            member={member}
            milestones={milestones}
            snapshots={snapshots}
            remaining={remaining}
            etaDays={etaDays}
            upcoming={upcoming}
            daysJoined={daysJoined}
            onShare={() => setShareOpen(true)}
          />

          <Reveal>
            <div className="border-t border-line pt-6 text-sm text-mist">
              这是你的账号？
              <button
                onClick={() => setSubmitOpen(true)}
                className="ml-1 font-semibold text-ink underline underline-offset-4 hover:text-mist"
              >
                立即自助更新
              </button>
              <span className="mx-2">·</span>
              <Link to="/reports/$memberId" params={{ memberId: member.id }} className="font-semibold text-ink underline underline-offset-4 hover:text-mist">
                内容周报
              </Link>
              <span className="mx-2">·</span>
              <Link to="/compare" search={{ a: member.id, b: "" }} className="font-semibold text-ink underline underline-offset-4 hover:text-mist">
                发起对比
              </Link>
            </div>
          </Reveal>
        </main>

        <SubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} defaultHandle={member.handle} />
        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} member={member} />
    </div>
  );
}

function Stat({
  label,
  value,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Card className="card-lift h-full">
      <CardContent className="px-5 py-4">
        <div className="text-sm text-mist">{label}</div>
        <AnimatedNumber
          value={value}
          prefix={prefix}
          suffix={suffix}
          className="mt-1.5 block text-2xl font-bold tabular-nums sm:text-3xl"
        />
      </CardContent>
    </Card>
  );
}

function MemberNotFound({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <h1 className="text-3xl font-bold">成员不存在</h1>
    </div>
  );
}
