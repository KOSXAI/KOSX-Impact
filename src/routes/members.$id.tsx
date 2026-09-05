import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber, GrowProgress, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { GrowthChart } from "@/components/member/GrowthChart";
import { fmt, fmtDate, badge } from "@/lib/format";
import { nextThreshold, tierOf, TIER_STYLE } from "@/milestones";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, xProfileUrl } from "@/lib/site";
import { ArrowLeft } from "lucide-react";

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
    return {
      meta: [
        { title: `${name} · ${SITE_NAME}` },
        ...(loaderData
          ? [{ name: "description", content: `${name} 的成长档案：粉丝量曲线、台阶与成就徽章。` }]
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: `${name} · ${SITE_NAME}` },
        { property: "og:description", content: "看见每个人的成长——这是 TA 迈向万粉及更高台阶的进度。" },
        { property: "og:type", content: "profile" },
        ...(loaderData
          ? [
              { property: "og:image", content: `${SITE_URL}/card/${loaderData.member.id}.svg` },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${SITE_URL}/card/${loaderData.member.id}.svg` },
            ]
          : []),
      ],
    };
  },
  component: MemberPage,
  notFoundComponent: () => <MemberNotFound id="" />,
});

function MemberPage() {
  const { member, snapshots, milestones } = Route.useLoaderData();
  const name = member.displayName ?? member.handle;
  const [submitOpen, setSubmitOpen] = useState(false);

  // ETA：近 7 天增速优先（更新鲜），为零/为负退 30 天；都停滞则不预估
  const remaining = Math.max(0, member.nextTier - (member.latestFollowers ?? 0));
  const dailyRate = member.growth7d > 0 ? member.growth7d / 7 : member.growth30d / 30;
  const etaDays = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;

  // 接下来的 4 级台阶路线（下一枚成就起）
  const upcoming: number[] = [];
  let t = member.nextTier;
  for (let i = 0; i < 4; i++) {
    upcoming.push(t);
    t = nextThreshold(t);
  }

  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          返回看板
        </Link>

        <div className="mt-8 flex items-center gap-5">
          <Avatar url={member.profileImage} name={name} className="size-20" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
              <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <a
                href={xProfileUrl(member.handle)}
                target="_blank"
                rel="noreferrer"
                className="text-base text-mist underline-offset-4 hover:text-ink hover:underline"
              >
                @{member.handle}
              </a>
              <Badge variant="secondary">加入于 {fmtDate(member.joinedAt)}</Badge>
            </div>
          </div>
        </div>
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

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">台阶之路</h2>
            <Card className="card-lift mt-6">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{fmt(member.latestFollowers ?? 0)}</div>
                    <div className="text-sm text-mist">
                      下一台阶 {badge(member.nextTier)} · 还差 {fmt(remaining)}
                      {etaDays != null ? (
                        etaDays > 365 ? (
                          <> · 照目前速度还需一年以上</>
                        ) : (
                          <>
                            {" "}· 照目前速度约 <b className="text-ink tabular-nums">{fmt(etaDays)}</b> 天登上
                          </>
                        )
                      ) : (
                        <> · 按目前速度暂无法预估</>
                      )}
                    </div>
                  </div>
                </div>
                <GrowProgress value={member.progressToNext} className="mt-6 h-2" />
                <div className="mt-2 flex justify-between text-sm text-mist">
                  <span>{member.prevTier > 0 ? badge(member.prevTier) : "0"}</span>
                  <span>{badge(member.nextTier)}</span>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  <span className="text-sm text-mist">接下来的台阶</span>
                  {upcoming.map((threshold) => (
                    <Badge key={threshold} variant="outline" className="text-mist">
                      {badge(threshold)}
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
            <GrowthChart snapshots={snapshots} nextTier={member.nextTier} className="mt-6" />
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
                {[...milestones].reverse().map((m) => {
                  const style = TIER_STYLE[tierOf(m.threshold).key] ?? TIER_STYLE.seed;
                  return (
                    <div
                      key={m.threshold}
                      title={`${fmtDate(m.achievedAt)} 达成`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
                        style.badge
                      )}
                    >
                      <span aria-hidden="true">🏅</span>
                      {badge(m.threshold)}
                    </div>
                  );
                })}
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
          className="mt-1.5 block text-2xl font-bold tabular-nums"
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
