import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { MemberStats } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, Users, Target, Sparkles, ArrowUpRight } from "lucide-react";
import { fmt, fmtDate, badge, nextGoal } from "@/lib/format";
import { GITHUB_APPLY_URL } from "@/lib/site";

export const Route = createFileRoute("/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: "KOSX Impact · KOSX 社群影响力看板" },
      { name: "description", content: "KOSX 社群的公开影响力数据平台：追踪成员在 X 上的成长，Road to 10K 万粉计划进行中。" },
      { property: "og:title", content: "KOSX Impact · KOSX 社群影响力看板" },
      { property: "og:description", content: "看见每个人的成长，也看见整个社群正在产生多大的影响。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://10k.kosx.ai/" },
      { property: "og:image", content: "https://10k.kosx.ai/og.svg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://10k.kosx.ai/og.svg" },
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight">KOSX Impact</h1>
        <p className="text-muted-foreground">看见每个人的成长，也看见整个社群正在产生多大的影响。</p>
      </header>

      <main className="mt-8 space-y-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Users className="size-4" />} label="社群总粉丝" value={fmt(stats.totalFollowers)} />
          <StatCard icon={<TrendingUp className="size-4" />} label="累计增长" value={fmt(stats.totalGrowth)} />
          <StatCard icon={<Sparkles className="size-4" />} label="里程碑" value={fmt(stats.totalMilestones)} />
          <StatCard icon={<Target className="size-4" />} label="追踪成员" value={fmt(stats.members.length)} />
        </section>

        {justAchieved && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-violet-500/10 px-4 py-3 text-sm">
            <span>🎉 刚刚达成：</span>
            <Link to="/members/$id" params={{ id: latest.memberId }} className="font-semibold underline-offset-4 hover:underline">
              {latest.displayName ?? latest.handle}
            </Link>
            <span>跨过 {badge(latest.threshold)}！</span>
          </div>
        )}

        {stats.members.length === 0 ? (
          <p className="text-muted-foreground">还没有成员加入。第一批成员正在路上，敬请期待。</p>
        ) : (
          <>
            {achieved.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Trophy className="size-5 text-amber-500" /> 万粉俱乐部
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">他们已达成 10K 目标，正在前往下一站。</p>
                <div className="mt-4 space-y-3">
                  {achieved.map((m) => (
                    <ClubMember key={m.id} member={m} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xl font-semibold">{achieved.length > 0 ? "冲刺中" : "增长榜"}</h2>
              {chasing.length === 0 ? (
                <p className="text-muted-foreground mt-3">所有人都在庆祝中——暂时没有正在冲刺的成员。</p>
              ) : (
                <div className="mt-2 divide-y">
                  {chasing.map((m, i) => (
                    <ChasingMember key={m.id} member={m} rank={i + 1} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section>
          <h2 className="text-xl font-semibold">最近里程碑</h2>
          {stats.recentMilestones.length === 0 ? (
            <p className="text-muted-foreground mt-3">还没有里程碑。第一个 1K 正在路上。</p>
          ) : (
            <div className="mt-2 divide-y">
              {stats.recentMilestones.map((m) => (
                <div key={`${m.memberId}-${m.threshold}`} className="flex items-center gap-3 py-2.5 text-sm">
                  <Badge variant="secondary" className="rounded-full font-semibold text-violet-600 dark:text-violet-400">
                    {badge(m.threshold)}
                  </Badge>
                  <Link to="/members/$id" params={{ id: m.memberId }} className="font-medium underline-offset-4 hover:underline">
                    {m.displayName ?? m.handle}
                  </Link>
                  <span className="text-muted-foreground ml-auto text-xs">{fmtDate(m.achievedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="mt-10">
          <div className="rounded-xl border border-violet-500/25 bg-gradient-to-r from-violet-500/10 via-transparent to-amber-500/10 p-5">
            <h2 className="text-lg font-semibold">想加入这场远征？</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              看板上的每张曲线背后都是一位成员。把你的 X 账号加入追踪，从提交当天起每天记录你的成长——不需要会代码，填一份申请就够。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
                  在 GitHub 提交申请 <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Link to="/about" className="text-sm underline-offset-4 hover:underline">
                先了解加入流程
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground mt-12 text-sm">
        数据每日更新一次，来自成员账号的公开信息。<Link to="/about" className="underline-offset-4 hover:underline">关于与数据口径</Link> ·{" "}
        <a href="https://github.com/KOSXAI/KOSX-Impact" className="underline-offset-4 hover:underline">GitHub 仓库</a>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function ClubMember({ member: m }: { member: MemberStats }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-amber-500/35 bg-gradient-to-br from-violet-500/8 to-amber-500/10 p-4">
      <Trophy className="size-8 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          <Link to="/members/$id" params={{ id: m.id }} className="underline-offset-4 hover:underline">
            {m.displayName ?? m.handle}
          </Link>
          <Badge className="bg-gradient-to-r from-amber-600 to-violet-600 text-white">已达成 {badge(m.goal)}</Badge>
        </div>
        <div className="text-muted-foreground text-sm">@{m.handle}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">
          下一站 {fmt(nextGoal(m.goal))} · 连胜 {m.streakDays} 天 · 30 天 +{fmt(m.growth30d)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">超目标 +{fmt(m.overflow)}</div>
      </div>
    </div>
  );
}

function ChasingMember({ member: m, rank }: { member: MemberStats; rank: number }) {
  const delta = m.growth > 0 ? `+${fmt(m.growth)}` : fmt(m.growth);
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="w-6 shrink-0 text-muted-foreground tabular-nums">{rank}</div>
      <div className="min-w-0 flex-1">
        <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
          {m.displayName ?? m.handle}
        </Link>
        <div className="text-muted-foreground text-sm">@{m.handle}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">连续 {m.streakDays} 天 · 7 天 +{fmt(m.growth7d)} · 30 天 +{fmt(m.growth30d)}</div>
        <Progress value={m.progress} className="mt-2 h-1.5" />
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{delta}</div>
      </div>
    </div>
  );
}