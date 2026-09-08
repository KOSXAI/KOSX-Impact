import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber, GrowProgress, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { BannerImage } from "@/components/member/BannerImage";
import { TierBadge } from "@/components/member/TierBadge";
import { TitleBadge, titleBadgeClass } from "@/components/member/TitleBadge";
import { trackOf } from "@/tracks";
import { Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { ShareDialog } from "@/components/member/ShareDialog";
import { GrowthChart } from "@/components/member/GrowthChart";
import { PostActivity } from "@/components/member/PostActivity";
import { InfluenceCard } from "@/components/member/InfluenceCard";
import { FanProfileCard } from "@/components/member/FanProfileCard";
import { SimilarAccountsCard } from "@/components/member/SimilarAccountsCard";
import { fmt, fmtDate, badge } from "@/lib/format";
import type { PostItem } from "@/stats";
import { TEN_K, nextThreshold, titleOf } from "@/milestones";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, xProfileUrl } from "@/lib/site";
import { BadgeCheck, ExternalLink, MapPin, PauseCircle, Share2, Trophy } from "lucide-react";

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

/** 赛道图标映射（src/tracks.ts 存图标名字符串，这里映射到 lucide 组件） */
const TRACK_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

/** X 龄：账号创建距今的时长（不足一年按月） */
function xAgeText(xCreatedAt: string | null): string | null {
  if (!xCreatedAt) return null;
  const created = Date.parse(xCreatedAt);
  if (Number.isNaN(created)) return null;
  const days = Math.floor((Date.now() - created) / 86_400_000);
  if (days < 0) return null;
  if (days < 365) return `X 龄 ${Math.max(1, Math.round(days / 30.4))} 个月`;
  return `X 龄 ${Math.floor(days / 365.25)} 年`;
}

/** 主页外链的展示文案：只显示主机名（去掉 www.），长链接不撑爆 chip */
function urlHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 横幅上的磨砂玻璃圆钮：深色半透明底 + 背景模糊，任何横幅图上都可读 */
const frostedBtn =
  "inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-ink shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/45 focus-visible:bg-black/45";

/** 横幅上的分享钮：打开分享弹窗（X 分享/文案/链接/OG 卡预览复制下载） */
function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="分享"
      title="分享"
      className={frostedBtn}
    >
      <Share2 className="size-4" />
    </button>
  );
}

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

  const age = xAgeText(profile.xCreatedAt);
  const homeHost = profile.url ? urlHost(profile.url) : null;

  // 次级计数：关注 / 发帖 / 列表收录 / 点赞（近 30 天增量有值才显示）
  const secondary: Array<{ label: string; value: number | null; delta?: number | null }> = [
    { label: "关注", value: counters.following, delta: counters.delta30d.following },
    { label: "发帖", value: counters.posts, delta: counters.delta30d.posts },
    { label: "列表收录", value: counters.listedCount, delta: counters.delta30d.listedCount },
    { label: "点赞", value: counters.favouritesCount, delta: counters.delta30d.favouritesCount },
  ];

  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          {/* 档案卡：横幅 hero + 身份区 + 简介（全部来自 X 公开资料） */}
          <section className="overflow-hidden rounded-3xl border border-line bg-surface">
            <div className="relative h-32 sm:h-44">
              {profile.bannerUrl ? (
                <BannerImage src={profile.bannerUrl} />
              ) : (
                <div
                  aria-hidden="true"
                  className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface"
                />
              )}
              <div
                aria-hidden="true"
                className="from-surface via-surface/30 absolute inset-0 bg-gradient-to-t to-transparent"
              />
              {/* 分享圆钮压在横幅右上角：磨砂玻璃质感，同时填起顶部留白 */}
              <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-end p-3 sm:p-4">
                <ShareButton onClick={() => setShareOpen(true)} />
              </div>
            </div>
            <div className="px-6 pb-6 sm:px-8">
              {/* z-10：横幅容器是定位元素会盖住静态兄弟，头像压边必须抬高一层 */}
              <div className="relative z-10 -mt-12 sm:-mt-14">
                <div className="flex items-end gap-4">
                  <Avatar url={member.profileImage} name={name} className="ring-surface size-20 ring-4 sm:size-24" />
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
                      {profile.verified && (
                        <BadgeCheck className="size-5 text-sky-400" aria-label="X 认证账号" />
                      )}
                      <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={xProfileUrl(member.handle)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-signal/40 hover:text-ink"
                  >
                    @{member.handle}
                  </a>
                  {insights?.inactive && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist"
                      title="近 14 天没有发布新内容"
                    >
                      <PauseCircle className="size-3.5 text-signal" aria-hidden="true" />
                      已 {insights.inactiveDays} 天未更新
                    </span>
                  )}
                  {profile.location && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {profile.location}
                    </span>
                  )}
                  {age && (
                    <span className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
                      {age}
                    </span>
                  )}
                  <span className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
                    加入于 {fmtDate(member.joinedAt)}
                  </span>
                  {profile.url && homeHost && (
                    <a
                      href={profile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-signal/40 hover:text-ink"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {homeHost}
                    </a>
                  )}
                </div>
              </div>
              {/* 赛道 + 标签：Grok 分类产物，未打标不显示 */}
              {(member.tracks.length > 0 || member.tags.length > 0) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {member.tracks.map((t) => {
                    const track = trackOf(t);
                    if (!track) return null;
                    const Icon = TRACK_ICON_MAP[track.icon] ?? Shapes;
                    return (
                      <span
                        key={t}
                        title={track.description}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                          t === "AI工具"
                            ? "border-signal/40 bg-signal/10 text-signal"
                            : "border-line bg-soft-surface text-ink"
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {t}
                      </span>
                    );
                  })}
                  {member.tags.length > 0 && (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {member.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs text-mist">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              )}
              {/* 赛道内名次：按粉丝量排的本赛道名次（引流 + 社会证明） */}
              {neighbors && neighbors.trackRanks.some((r) => r.total > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {neighbors.trackRanks
                    .filter((r) => r.total > 0)
                    .map(({ track, rank, total }) => (
                      <Link
                        key={track}
                        to="/tracks"
                        className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/8 px-3 py-1 text-xs font-semibold text-signal transition-colors hover:border-signal/50"
                        title={`${track} 赛道内第 ${rank} 名（共 ${total} 人，按粉丝量）`}
                      >
                        {track} · 第 {rank} 名 / {total}
                      </Link>
                    ))}
                </div>
              )}
              {profile.bio && (
                <p className="text-mist mt-4 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>
              )}
            </div>
          </section>
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
              <MemberContentInsights posts={posts30d} snapshots={snapshots} />
            </Reveal>
          )}

          {/* 粉丝圈画像：粉丝样本质量指标（月度刷新） */}
          <Reveal>
            <section>
              <FanProfileCard fanProfile={fanProfile} />
            </section>
          </Reveal>

          {/* 相似账号：Grok 扫描推荐 */}
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

          <Reveal>
            <section>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">称号之路</h2>
                {member.progressToNext >= 80 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-0.5 text-xs font-semibold text-signal shadow-[0_0_10px_rgba(255,106,0,0.2)]">
                    🔥 冲线在即
                  </span>
                )}
              </div>
              <Card className="card-lift relative overflow-hidden mt-6">
                {member.progressToNext >= 80 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-signal/15 blur-2xl"
                  />
                )}
                <CardContent className="p-6 sm:p-8">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
                      <TitleBadge threshold={member.prevMilestone} />
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-sm text-mist">当前粉丝</div>
                      <div className="mt-1 text-3xl font-bold tabular-nums">{fmt(member.latestFollowers ?? 0)}</div>
                    </div>
                  </div>
                  <GrowProgress
                    value={member.progressToNext}
                    className="mt-6 h-2"
                    ariaLabel={`距下一称号「${titleOf(member.nextMilestone)}」进度 ${member.progressToNext}%`}
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-mist">{member.prevMilestone > 0 ? titleOf(member.prevMilestone) : "新人村"}</span>
                    <span className={cn("font-semibold", member.nextMilestone === TEN_K ? "text-signal" : "text-amber-300")}>
                      {titleOf(member.nextMilestone)}
                    </span>
                  </div>
                  {/* 量化区：标签+数值的数据块，取代旧的一行「·」连排文案 */}
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-mist">还差</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums">
                        {fmt(remaining)}
                        <span className="ml-1 text-sm font-semibold text-mist">粉</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-mist">照目前速度</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums">
                        {etaDays == null ? (
                          <span className="text-mist">—</span>
                        ) : etaDays > 365 ? (
                          <>一年以上</>
                        ) : (
                          <>
                            <span className="text-base font-semibold text-mist">约 </span>
                            {fmt(etaDays)}
                            <span className="text-base font-semibold text-mist"> 天</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    <span className="text-sm text-mist">接下来的称号</span>
                    {upcoming.map((threshold) => (
                      <Badge key={threshold} variant="outline" className="gap-1.5 text-mist transition-colors hover:border-white/25 hover:text-ink select-none cursor-default">
                        {titleOf(threshold)}
                        <span className="text-xs font-normal text-mist/60 tabular-nums">{badge(threshold)}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          </Reveal>

          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">成长曲线</h2>
              <GrowthChart snapshots={snapshots} nextMilestone={member.nextMilestone} className="mt-6" />
            </section>
          </Reveal>

          <Reveal>
            <section>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold">成就徽章</h2>
                {milestones.length > 0 && <Badge variant="secondary">{milestones.length}</Badge>}
              </div>
              {milestones.length === 0 ? (
                <p className="mt-4 text-mist">还没有成就，第一枚徽章正在路上。</p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {[...milestones].reverse().map((m) => (
                    <div
                      key={m.threshold}
                      title={`${fmtDate(m.achievedAt)} 达成 · ${badge(m.threshold)}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
                        titleBadgeClass(m.threshold)
                      )}
                    >
                      <span aria-hidden="true">🏅</span>
                      {titleOf(m.threshold)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

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

/** 内容密码：从帖子 + 快照挖出的三条实用洞察（全部启发式，样本不足自动隐藏） */
function MemberContentInsights({
  posts,
  snapshots,
}: {
  posts: PostItem[];
  snapshots: Array<{ followers: number; recordedAt: string }>;
}) {
  // 黄金时段：按北京时间小时桶 × 平均曝光（至少 2 帖才出结论）
  const buckets = new Map<number, { v: number; c: number }>();
  for (const p of posts) {
    const h = (new Date(p.createdAt).getUTCHours() + 8) % 24;
    const b = buckets.get(h) ?? { v: 0, c: 0 };
    b.v += p.views ?? 0;
    b.c += 1;
    buckets.set(h, b);
  }
  let bestHour: number | null = null;
  let bestAvg = -1;
  for (const [h, b] of buckets) {
    if (b.c >= 2 && b.v / b.c > bestAvg) {
      bestAvg = b.v / b.c;
      bestHour = h;
    }
  }
  const hourLabel = bestHour != null ? `${String(bestHour).padStart(2, "0")}:00` : null;

  // 最有讨论度：评论数 ≥20 且显著多于点赞
  const debate = posts
    .filter((p) => (p.replies ?? 0) >= 20 && (p.replies ?? 0) > (p.likes ?? 0) * 1.5)
    .sort((a, b) => (b.replies ?? 0) - (a.replies ?? 0))
    .slice(0, 3);

  // 爆款涨粉归因：浏览量最高的帖子，发帖前后 3 天内粉丝跳涨
  const top = [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  let attribution: { post: PostItem; gained: number } | null = null;
  if (top && (top.views ?? 0) >= 10_000 && snapshots.length >= 2) {
    const postDay = top.createdAt.slice(0, 10);
    const idx = snapshots.findIndex((s) => s.recordedAt.slice(0, 10) >= postDay);
    const base = idx > 0 ? snapshots[idx - 1].followers : snapshots[0].followers;
    let end = snapshots[snapshots.length - 1].followers;
    for (let i = idx; i < snapshots.length && i <= idx + 3; i++) end = snapshots[i].followers;
    const gained = end - base;
    if (gained > 0) attribution = { post: top, gained };
  }

  if (!hourLabel && debate.length === 0 && !attribution) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold">内容密码</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {hourLabel && (
          <div className="card-lift rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm text-mist">黄金时段</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">{hourLabel}</div>
            <div className="mt-0.5 text-xs text-mist">北京时间的帖子平均曝光最高</div>
          </div>
        )}
        {attribution && (
          <a href={attribution.post.url} target="_blank" rel="noopener noreferrer" className="card-lift block rounded-2xl border border-signal/30 bg-surface p-5 transition-colors hover:border-signal/50">
            <div className="text-sm text-mist">爆款带来</div>
            <div className="mt-1.5 text-2xl font-bold text-signal tabular-nums">+{fmt(attribution.gained)} 粉</div>
            <div className="mt-0.5 line-clamp-1 text-xs text-mist">{attribution.post.text ?? "爆款帖子"}</div>
          </a>
        )}
        {debate.length > 0 && (
          <div className="card-lift rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm text-mist">最有讨论度</div>
            <div className="mt-1.5 space-y-1">
              {debate.map((p) => (
                <a key={p.tweetId} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-ink">
                  <span className="line-clamp-1 min-w-0 flex-1 text-mist">{p.text ?? "帖子"}</span>
                  <b className="shrink-0 tabular-nums">{p.replies ?? 0} 评</b>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
