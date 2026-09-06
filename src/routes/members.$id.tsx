import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber, GrowProgress, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { TitleBadge, titleBadgeClass } from "@/components/member/TitleBadge";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { SiteHeader } from "@/components/SiteHeader";
import { GrowthChart } from "@/components/member/GrowthChart";
import { fmt, fmtDate, badge } from "@/lib/format";
import { nextThreshold, titleOf } from "@/milestones";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, xProfileUrl } from "@/lib/site";
import { ArrowLeft, BadgeCheck, ExternalLink, MapPin } from "lucide-react";

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

/** 档案横幅：X 横幅可能随时被成员删掉（URL 失效），加载失败回退渐变底 */
function BannerImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div aria-hidden="true" className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface" />;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}

function MemberPage() {
  const { member, profile, counters, snapshots, milestones } = Route.useLoaderData();
  const name = member.displayName ?? member.handle;
  const [submitOpen, setSubmitOpen] = useState(false);

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

          {/* 档案卡：横幅 hero + 身份区 + 简介（全部来自 X 公开资料） */}
          <section className="mt-8 overflow-hidden rounded-3xl border border-line bg-surface">
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

          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">称号之路</h2>
              <Card className="card-lift mt-6">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
                      <TitleBadge threshold={member.prevMilestone} />
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-3xl font-bold tabular-nums">{fmt(member.latestFollowers ?? 0)}</div>
                      <div className="text-sm text-mist">
                        下一称号「{titleOf(member.nextMilestone)}」 · 还差 {fmt(remaining)}
                        {etaDays != null ? (
                          etaDays > 365 ? (
                            <> · 照目前速度还需一年以上</>
                          ) : (
                            <>
                              {" "}· 照目前速度约 <b className="text-ink tabular-nums">{fmt(etaDays)}</b> 天拿下
                            </>
                          )
                        ) : (
                          <> · 按目前速度暂无法预估</>
                        )}
                      </div>
                    </div>
                  </div>
                  <GrowProgress
                    value={member.progressToNext}
                    className="mt-6 h-2"
                    ariaLabel={`距下一称号「${titleOf(member.nextMilestone)}」进度 ${member.progressToNext}%`}
                  />
                  <div className="mt-2 flex justify-between text-sm text-mist">
                    <span>{member.prevMilestone > 0 ? titleOf(member.prevMilestone) : "新人村"}</span>
                    <span>{titleOf(member.nextMilestone)}</span>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    <span className="text-sm text-mist">接下来的称号</span>
                    {upcoming.map((threshold) => (
                      <Badge key={threshold} variant="outline" className="gap-1.5 text-mist">
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
            </div>
          </Reveal>
        </main>

        <SubmitDialog open={submitOpen} onOpenChange={setSubmitOpen} defaultHandle={member.handle} />
      </div>
    </>
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
      <p className="mt-4">
        <Link to="/" className="text-mist underline-offset-4 hover:text-ink hover:underline">
          ← 返回看板
        </Link>
      </p>
    </div>
  );
}
