import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { DashboardStats, MemberStats } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, GrowProgress, PopIn, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { Flag } from "lucide-react";
import { TIER_STYLE, TIERS } from "@/milestones";
import { fmt, fmtDate, badge } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
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

type TabKey = "leaderboard" | "growth" | "climbs";

/** 总排行前三的荣誉样式：冠军/亚军/季军（奖牌渐变 + 榜位徽章） */
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
  // 总排行：最新粉丝量从高到低（stats.members 已按此排序）
  const leaderboard = stats.members;
  // 成长榜：近 30 天增长优先，其次近 7 天、加入以来增长——小账号也有机会登顶
  const growth = [...stats.members].sort(
    (a, b) => b.growth30d - a.growth30d || b.growth7d - a.growth7d || b.growth - a.growth
  );
  const latest = stats.recentMilestones[0];
  const justAchieved = latest && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  const [applyOpen, setApplyOpen] = useState(false);

  const [tab, setTab] = useState<TabKey>("leaderboard");
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "leaderboard", label: "总排行", count: leaderboard.length },
    { key: "growth", label: "成长榜", count: growth.length },
    { key: "climbs", label: "登阶记录", count: stats.recentMilestones.length },
  ];

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
      </Reveal>

      {/* 数据卡与 CTA 全局：Tab 只切换榜单视图，页面长度与成员数量无关 */}
      <RevealGroup className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
        <RevealItem>
          <StatCard label="社群粉丝" value={stats.totalFollowers} />
        </RevealItem>
        <RevealItem>
          <StatCard label="近 30 天新增" value={stats.totalGrowth30d} prefix="+" />
        </RevealItem>
        <RevealItem>
          <StatCard label="万粉成员" value={stats.tenKMembers} />
        </RevealItem>
        <RevealItem>
          <StatCard label="追踪成员" value={stats.members.length} />
        </RevealItem>
      </RevealGroup>

      {/* 社群全景：段位分布 + 总量趋势（数据点满 2 天自动出现折线） */}
      <Reveal delay={0.08}>
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">社群全景</h2>
          <TierDistribution members={stats.members} />
          {stats.trend.length >= 2 && (
            <div className="mt-6 border-t border-line pt-6">
              <TrendChart data={stats.trend} />
            </div>
          )}
        </section>
      </Reveal>

      {justAchieved && (
        <PopIn className="mt-8 flex items-center gap-2 rounded-2xl border border-signal/20 bg-signal/8 px-5 py-4">
          <span>🎉 恭喜</span>
          <Link to="/members/$id" params={{ id: latest.memberId }} className="font-semibold underline-offset-4 hover:underline">
            {latest.displayName ?? latest.handle}
          </Link>
          <span>登上 {badge(latest.threshold)} 台阶</span>
        </PopIn>
      )}

      {/* Tab 切换：总排行 / 成长榜 / 登阶记录 */}
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
        {tab === "leaderboard" && <LeaderboardList members={leaderboard} />}
        {tab === "growth" && <GrowthSection members={growth} />}
        {tab === "climbs" && <ClimbsList stats={stats} />}
      </main>

      <Reveal delay={0.1}>
        <section className="mt-12 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">加入这场远征</h2>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button onClick={() => setApplyOpen(true)}>加入追踪</Button>
            <Link to="/about" className="text-mist underline-offset-4 hover:text-ink hover:underline">
              了解流程
            </Link>
          </div>
        </section>
      </Reveal>

      <SubmitDialog open={applyOpen} onOpenChange={setApplyOpen} />
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

/** 段位分布：按段位从高到低的分段条 + 计数图例（只在有人的段位出现） */
function TierDistribution({ members }: { members: MemberStats[] }) {
  const census = TIERS.map(({ tier }) => ({
    key: tier.key,
    name: tier.name,
    count: members.filter((m) => m.tierKey === tier.key).length,
    fill: TIER_STYLE[tier.key]?.fill ?? "#94a3b8",
  })).filter((t) => t.count > 0);

  if (census.length === 0) return null;

  return (
    <>
      <div className="mt-5 flex h-2.5 gap-0.5">
        {census.map((t) => (
          <div
            key={t.key}
            title={`${t.name} ${t.count} 人`}
            className="h-full min-w-1.5 rounded-full"
            style={{ flexGrow: t.count, flexBasis: 0, background: t.fill }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {census.map((t) => (
          <span
            key={t.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist"
          >
            <span className="size-2 rounded-full" style={{ background: t.fill }} aria-hidden="true" />
            {t.name}
            <b className="text-ink tabular-nums">{t.count}</b>
          </span>
        ))}
      </div>
    </>
  );
}

function LeaderboardList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有成员上榜。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <LeaderboardMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

/** 总排行行：前三名带奖牌徽章与渐变底色；右侧粉丝量 + 距下一台阶进度 */
function LeaderboardMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
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
          <TierBadge tierKey={m.tierKey} tierName={m.tierName} />
          {m.climbs > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist tabular-nums"
              title={`${m.climbs} 枚成就徽章`}
            >
              🏅 {m.climbs}
            </span>
          )}
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
      </div>
      <div className="flex w-44 shrink-0 flex-col items-end gap-1.5">
        <div className="font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
        <div className="flex w-full items-center gap-2">
          <GrowProgress value={m.progressToNext} className="flex-1" />
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist tabular-nums"
            title="下一台阶"
          >
            <Flag className="size-3 text-signal" aria-hidden="true" />
            {badge(m.nextTier)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 成长榜：近 7 天 / 近 30 天口径切换，按所选范围排序，小账号也有机会登顶 */
function GrowthSection({ members }: { members: MemberStats[] }) {
  const [range, setRange] = useState<7 | 30>(30);
  const sorted = [...members].sort((a, b) =>
    range === 7 ? b.growth7d - a.growth7d : b.growth30d - a.growth30d
  );

  return (
    <>
      <div className="mb-2 flex justify-end gap-1">
        {([30, 7] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "h-7 rounded-full px-3 text-xs font-semibold transition-colors",
              range === r ? "bg-white text-paper" : "text-mist hover:text-ink"
            )}
          >
            近 {r} 天
          </button>
        ))}
      </div>
      <ol className="space-y-3">
        {sorted.map((m, i) => (
          <RevealItem key={m.id} y={16}>
            <GrowthMember member={m} rank={i + 1} range={range} />
          </RevealItem>
        ))}
      </ol>
    </>
  );
}

/** 成长榜行：选中口径的数字高亮，另一口径弱化 */
function GrowthMember({ member: m, rank, range }: { member: MemberStats; rank: number; range: 7 | 30 }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="flex items-center gap-3 py-4 sm:gap-4">
      <div className="w-6 shrink-0 text-mist tabular-nums">{rank}</div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TierBadge tierKey={m.tierKey} tierName={m.tierName} />
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-6">
        <div className="text-right">
          <div className={cn("font-bold tabular-nums", range === 7 ? "text-signal" : "text-mist")}>
            +{fmt(m.growth7d)}
          </div>
          <div className="text-xs text-mist">近 7 天</div>
        </div>
        <div className="text-right">
          <div className={cn("font-bold tabular-nums", range === 30 ? "text-signal" : "text-mist")}>
            +{fmt(m.growth30d)}
          </div>
          <div className="text-xs text-mist">近 30 天</div>
        </div>
      </div>
    </div>
  );
}

function ClimbsList({ stats }: { stats: DashboardStats }) {
  if (stats.recentMilestones.length === 0) return <p className="text-mist">还没有登阶记录，第一枚成就正在路上。</p>;
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
