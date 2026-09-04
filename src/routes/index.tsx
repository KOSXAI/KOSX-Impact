import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { MemberStats } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, GrowProgress, PopIn, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { ArrowUpRight } from "lucide-react";
import { fmt, fmtDate, badge, nextGoal } from "@/lib/format";
import { GITHUB_APPLY_URL, SITE_NAME, SLOGAN, xProfileUrl } from "@/lib/site";

export const Route = createFileRoute("/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: SITE_NAME },
      { name: "description", content: `${SITE_NAME}：追踪每一位成员从当前粉丝走向万粉的过程，看见每个人的成长，也看见整个社群正在产生多大的影响。` },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://10k.kosx.ai/" },
      { property: "og:image", content: "https://10k.kosx.ai/og.svg?v=2" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://10k.kosx.ai/og.svg?v=2" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = Route.useLoaderData();
  const achieved = stats.members.filter((m) => m.achieved);
  const chasing = stats.members.filter((m) => !m.achieved);
  const latest = stats.recentMilestones[0];
  const justAchieved = latest && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal className="flex flex-col gap-3" y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {SITE_NAME}
          <span className="accent-dot">。</span>
        </h1>
        <p className="max-w-xl text-base text-mist">{SLOGAN}</p>
      </Reveal>

      <main className="mt-10 space-y-12 sm:mt-14">
        <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
          <RevealItem>
            <StatCard label="社群粉丝" value={stats.totalFollowers} />
          </RevealItem>
          <RevealItem>
            <StatCard label="累计增长" value={stats.totalGrowth} prefix="+" />
          </RevealItem>
          <RevealItem>
            <StatCard label="里程碑" value={stats.totalMilestones} />
          </RevealItem>
          <RevealItem>
            <StatCard label="追踪成员" value={stats.members.length} />
          </RevealItem>
        </RevealGroup>

        {justAchieved && (
          <PopIn className="flex items-center gap-2 rounded-2xl border border-signal/20 bg-signal/8 px-5 py-4">
            <span>恭喜</span>
            <Link to="/members/$id" params={{ id: latest.memberId }} className="font-semibold underline-offset-4 hover:underline">
              {latest.displayName ?? latest.handle}
            </Link>
            <span>达成 {badge(latest.threshold)}，进入万粉俱乐部！</span>
          </PopIn>
        )}

        {stats.members.length === 0 ? (
          <p className="text-mist">还没有成员加入，第一批成员正在路上。</p>
        ) : (
          <>
            {achieved.length > 0 && (
              <Reveal>
                <section>
                  <h2 className="text-2xl font-bold">
                    万粉俱乐部
                    <span className="accent-dot">。</span>
                  </h2>
                  <RevealGroup className="mt-5 space-y-4">
                    {achieved.map((m) => (
                      <RevealItem key={m.id}>
                        <ClubMember member={m} />
                      </RevealItem>
                    ))}
                  </RevealGroup>
                </section>
              </Reveal>
            )}

            <Reveal>
              <section>
                <h2 className="text-2xl font-bold">
                  {achieved.length > 0 ? "冲刺中" : "增长榜"}
                  <span className="accent-dot">。</span>
                </h2>
                {chasing.length === 0 ? (
                  <p className="mt-4 text-mist">当前没有正在冲刺的成员。</p>
                ) : (
                  <RevealGroup className="mt-4 divide-y divide-line">
                    {chasing.map((m, i) => (
                      <RevealItem key={m.id} y={16}>
                        <ChasingMember member={m} rank={i + 1} />
                      </RevealItem>
                    ))}
                  </RevealGroup>
                )}
              </section>
            </Reveal>
          </>
        )}

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">
              最近里程碑
              <span className="accent-dot">。</span>
            </h2>
            {stats.recentMilestones.length === 0 ? (
              <p className="mt-4 text-mist">还没有里程碑，第一个千粉正在路上。</p>
            ) : (
              <RevealGroup className="mt-4 divide-y divide-line">
                {stats.recentMilestones.map((m) => (
                  <RevealItem
                    key={`${m.memberId}-${m.threshold}`}
                    y={12}
                    className="flex items-center gap-3 py-3"
                  >
                    <Badge variant="secondary">{badge(m.threshold)}</Badge>
                    <Link to="/members/$id" params={{ id: m.memberId }} className="font-medium underline-offset-4 hover:underline">
                      {m.displayName ?? m.handle}
                    </Link>
                    <span className="text-mist ml-auto">{fmtDate(m.achievedAt)}</span>
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">
              加入这场远征
              <span className="accent-dot">。</span>
            </h2>
            <p className="mt-2 max-w-xl text-mist">
              把你的 X 账号加入追踪，从加入当天起每天记录你的成长。不需要会代码，填一份申请就好。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button asChild>
                <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
                  提交申请 <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Link to="/about" className="text-mist underline-offset-4 hover:text-ink hover:underline">
                了解流程
              </Link>
            </div>
          </section>
        </Reveal>
      </main>
    </div>
  );
}

function StatCard({ label, value, prefix = "" }: { label: string; value: number; prefix?: string }) {
  return (
    <Card className="card-lift h-full">
      <CardContent className="px-5 py-4">
        <div className="text-sm text-mist">{label}</div>
        <AnimatedNumber value={value} prefix={prefix} className="mt-1.5 block text-3xl font-bold tabular-nums" />
      </CardContent>
    </Card>
  );
}

function ClubMember({ member: m }: { member: MemberStats }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="card-lift rounded-2xl border border-signal/20 bg-gradient-to-br from-signal/10 to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar url={m.profileImage} name={name} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link to="/members/$id" params={{ id: m.id }} className="text-lg font-semibold underline-offset-4 hover:underline">
              {name}
            </Link>
            <Badge>已达成 {badge(m.goal)}</Badge>
          </div>
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="text-sm text-mist">
          下一站 {fmt(nextGoal(m.goal))} · 连胜 {m.streakDays} 天 · 30 天 +{fmt(m.growth30d)}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
          <div className="text-sm font-medium text-signal">超目标 +{fmt(m.overflow)}</div>
        </div>
      </div>
    </div>
  );
}

function ChasingMember({ member: m, rank }: { member: MemberStats; rank: number }) {
  const delta = m.growth > 0 ? `+${fmt(m.growth)}` : fmt(m.growth);
  const name = m.displayName ?? m.handle;
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="w-6 shrink-0 text-mist tabular-nums">{rank}</div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
          {name}
        </Link>
        <a
          href={xProfileUrl(m.handle)}
          target="_blank"
          rel="noreferrer"
          className="text-mist block underline-offset-4 hover:text-ink hover:underline"
        >
          @{m.handle}
        </a>
        <div className="mt-1 text-sm text-mist">连续 {m.streakDays} 天 · 7 天 +{fmt(m.growth7d)} · 30 天 +{fmt(m.growth30d)}</div>
        <GrowProgress value={m.progress} className="mt-2" />
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
        <div className={`text-sm font-medium ${m.growth >= 0 ? "text-signal" : "text-fog"}`}>{delta}</div>
      </div>
    </div>
  );
}
