import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { DashboardStats, MemberStats } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, GrowProgress, PopIn, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { ArrowUpRight } from "lucide-react";
import { fmt, fmtDate, badge, nextGoal } from "@/lib/format";
import { GITHUB_APPLY_URL, SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: SITE_NAME },
      { name: "description", content: `${SITE_NAME}：追踪每一位成员迈向万粉及更高台阶的过程，看见每个人的成长，也看见整个社群正在产生多大的影响。` },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og.svg?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og.svg?v=2` },
    ],
  }),
  component: DashboardPage,
});

type TabKey = "chasing" | "hall" | "milestones";

/** 冲榜前三的荣誉样式：冠军/亚军/季军（奖牌渐变 + 榜位徽章） */
const PODIUM = [
  {
    label: "冠军",
    badge: "from-amber-300 to-amber-500 text-amber-950",
    ring: "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent",
    rankNum: "from-amber-300 to-amber-600 text-white",
  },
  {
    label: "亚军",
    badge: "from-slate-300 to-slate-400 text-slate-950",
    ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent",
    rankNum: "from-slate-300 to-slate-500 text-white",
  },
  {
    label: "季军",
    badge: "from-orange-400 to-orange-600 text-white",
    ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent",
    rankNum: "from-orange-400 to-orange-700 text-white",
  },
] as const;

function DashboardPage() {
  const stats = Route.useLoaderData();
  // 冲榜按最新粉丝数从高到低（用户规则）；已达成个人目标的进名人堂
  const chasing = stats.members
    .filter((m) => !m.achieved)
    .sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));
  const hall = stats.members
    .filter((m) => m.achieved)
    .sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));
  const latest = stats.recentMilestones[0];
  const justAchieved = latest && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<TabKey>("chasing");
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "chasing", label: "冲榜进行时", count: chasing.length },
    { key: "hall", label: "名人堂", count: hall.length },
    { key: "milestones", label: "最近里程碑", count: stats.recentMilestones.length },
  ];

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal className="flex flex-col gap-3" y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
        <p className="max-w-xl text-base text-mist">{SLOGAN}</p>
      </Reveal>

      {/* 数据卡与 CTA 全局：Tab 只切换榜单视图，页面长度与成员数量无关 */}
      <RevealGroup className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
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
        <PopIn className="mt-8 flex items-center gap-2 rounded-2xl border border-signal/20 bg-signal/8 px-5 py-4">
          <span>恭喜</span>
          <Link to="/members/$id" params={{ id: latest.memberId }} className="font-semibold underline-offset-4 hover:underline">
            {latest.displayName ?? latest.handle}
          </Link>
          <span>达成 {badge(latest.threshold)}，进入名人堂！</span>
        </PopIn>
      )}

      {/* Tab 切换：冲榜 / 名人堂 / 里程碑 */}
      <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-line bg-soft-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold transition-colors sm:px-5",
              tab === t.key ? "bg-white text-paper" : "text-mist hover:text-ink"
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      <main key={tab} className="tab-in mt-6">
        {tab === "chasing" && <ChasingList members={chasing} />}
        {tab === "hall" && <HallList members={hall} />}
        {tab === "milestones" && <MilestoneList stats={stats} />}
      </main>

      <Reveal delay={0.1}>
        <section className="mt-12 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">加入这场远征</h2>
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

function ChasingList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">当前没有人正在冲榜。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <ChasingMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

/** 冲榜行：前三名带奖牌徽章与渐变底色，其余普通行 */
function ChasingMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const delta = m.growth > 0 ? `+${fmt(m.growth)}` : fmt(m.growth);
  const name = m.displayName ?? m.handle;
  const toGoal = Math.max(0, m.goal - (m.latestFollowers ?? 0));
  return (
    <div
      className={
        podium
          ? `card-lift flex items-center gap-3 rounded-2xl border p-4 sm:gap-4 sm:p-5 ${podium.ring}`
          : "flex items-center gap-3 py-4 sm:gap-4"
      }
    >
      {podium ? (
        <div
          className={`bg-gradient-to-br flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${podium.rankNum}`}
        >
          {rank}
        </div>
      ) : (
        <div className="w-6 shrink-0 text-mist tabular-nums">{rank}</div>
      )}
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          {podium && (
            <Badge className={`bg-gradient-to-r ${podium.badge} border-transparent`}>{podium.label}</Badge>
          )}
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-mist text-sm underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
        <div className="mt-0.5 text-sm text-mist">
          距目标还差 {fmt(toGoal)} · 连胜 {m.streakDays} 天 · 7 天 +{fmt(m.growth7d)} · 30 天 +{fmt(m.growth30d)}
        </div>
        <GrowProgress value={m.progress} className="mt-2" />
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
        <div className={`text-sm font-medium ${m.growth >= 0 ? "text-signal" : "text-fog"}`}>{delta}</div>
      </div>
    </div>
  );
}

function HallList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">万粉名人堂虚位以待，第一位冲线者将在这里留名。</p>;
  return (
    <div className="space-y-4">
      {members.map((m) => (
        <RevealItem key={m.id}>
          <HallMember member={m} />
        </RevealItem>
      ))}
    </div>
  );
}

/** 名人堂行：已达成个人目标的荣誉成员 */
function HallMember({ member: m }: { member: MemberStats }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="card-lift rounded-2xl border border-line bg-surface p-5 sm:p-6">
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
          下一站 {badge(nextGoal(m.goal))} · 连胜 {m.streakDays} 天 · 30 天 +{fmt(m.growth30d)}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
          <div className="text-sm font-medium text-signal">超目标 +{fmt(m.overflow)}</div>
        </div>
      </div>
    </div>
  );
}

function MilestoneList({ stats }: { stats: DashboardStats }) {
  if (stats.recentMilestones.length === 0) return <p className="text-mist">还没有里程碑，第一个千粉正在路上。</p>;
  return (
    <div className="divide-y divide-line">
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
    </div>
  );
}
