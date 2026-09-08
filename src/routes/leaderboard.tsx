import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { fetchDashboard } from "@/data.functions";
import type { DashboardStats, MemberStats } from "@/stats";
import { GrowProgress, Reveal, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TitleBadge, titleBadgeClass } from "@/components/member/TitleBadge";
import { SiteHeader } from "@/components/SiteHeader";
import { MemberModuleNav } from "@/components/MemberModuleNav";
import { Flag, Clock3, Zap, Flame } from "lucide-react";
import { TEN_K, titleOf } from "@/milestones";
import { fmt, fmtDate, badge } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  // 视图状态进 URL：每个榜/时间档可分享、可被搜索引擎收录（多维时间榜）
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (
      ["leaderboard", "growth", "rising", "active", "mentions", "climbs", "influence"] as TabKey[]
    ).includes(search.tab as TabKey)
      ? (search.tab as TabKey)
      : ("leaderboard" as TabKey),
    metric: (["growth", "views", "posts", "replies"] as const).includes(search.metric as never)
      ? (search.metric as "growth" | "views" | "posts" | "replies")
      : ("growth" as const),
    range: (() => {
      const rv = String(search.range ?? "");
      return rv === "1" ? (1 as const) : rv === "7" ? (7 as const) : (30 as const);
    })(),
  }),
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: `榜单 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME} 榜单：总排行 / 成长榜 / 新锐潜力 / 影响力 / 登阶记录。` },
      { property: "og:title", content: `榜单 · ${SITE_NAME}` },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/leaderboard` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
  }),
  component: LeaderboardPage,
});

type TabKey = "leaderboard" | "growth" | "rising" | "active" | "mentions" | "climbs" | "influence";

/** 总排行 / 成长榜前三的荣誉样式：只保留行卡外壳（边框渐晕 + 名次渐变数字），不加榜位徽章抢内容的戏 */
const PODIUM = [
  {
    ring: "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent",
    rankNum: "from-amber-300 to-amber-600",
  },
  {
    ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent",
    rankNum: "from-slate-300 to-slate-500",
  },
  {
    ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent",
    rankNum: "from-orange-400 to-orange-700",
  },
] as const;

function LeaderboardPage() {
  const stats = Route.useLoaderData();
  const { tab, range, metric } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setTab = (t: TabKey) => navigate({ search: (prev) => ({ ...prev, tab: t }) });
  // 总排行：最新粉丝量从高到低（stats.members 已按此排序）
  const leaderboard = stats.members;
  // 成长榜：近 30 天增长优先，其次近 7 天、加入以来增长——小账号也有机会登顶
  const growth = [...stats.members].sort(
    (a, b) => b.growth30d - a.growth30d || b.growth7d - a.growth7d || b.growth - a.growth
  );
  // 影响力榜：指数从高到低（无粉丝数据的排最后）
  const influence = [...stats.members].sort(
    (a, b) => (b.influence?.score ?? -1) - (a.influence?.score ?? -1)
  );

  // 新锐潜力榜：近 30 天有帖子、帖均曝光效率最高的潜力账号（粉丝量不大但内容被看见）
  const rising = stats.members
    .filter((m) => m.avgViewsPerPost != null && m.posts30d! >= 1)
    .sort((a, b) => (b.avgViewsPerPost ?? 0) - (a.avgViewsPerPost ?? 0));
  // 勤快榜：近 30 天发帖最多的成员
  const active = [...stats.members].sort((a, b) => (b.posts30d ?? 0) - (a.posts30d ?? 0) || (b.posts7d ?? 0) - (a.posts7d ?? 0));
  // 被提及榜：近 30 天被讨论热度
  const mentions = stats.members.filter((m) => (m.mentionCount30d ?? 0) > 0).sort((a, b) => (b.mentionCount30d ?? 0) - (a.mentionCount30d ?? 0));

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "leaderboard", label: "总排行", count: leaderboard.length },
    { key: "growth", label: "成长榜", count: growth.length },
    { key: "rising", label: "新锐", count: rising.length },
    { key: "influence", label: "影响力", count: influence.length },
    { key: "mentions", label: "被提及", count: mentions.length },
    { key: "active", label: "勤快", count: active.length },
    { key: "climbs", label: "登阶记录", count: stats.recentMilestones.length },
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">榜单</h1>
        </Reveal>

        {/* 博主模块三视图：榜单 / 广场 / 赛道 */}
        <MemberModuleNav />

        {/* Tab 切换：总排行 / 成长榜 / 新锐 / 影响力 / 勤快 / 登阶记录 */}
        <div className="mt-4 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-soft-surface p-1 sm:inline-flex sm:w-auto">
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative h-10 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-200 select-none cursor-pointer sm:h-9 sm:flex-none sm:px-5",
                  isActive ? "text-paper" : "text-mist hover:text-ink"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="leaderboardActiveTab"
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  />
                )}
                <span className="relative z-10">
                  {t.label}
                  <span className={cn("ml-1.5 tabular-nums transition-opacity", isActive ? "opacity-80 font-bold" : "opacity-60")}>
                    {t.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <main key={tab} className="tab-in mt-6">
          {tab === "leaderboard" && <LeaderboardList members={leaderboard} />}
          {tab === "growth" && (
            <GrowthSection
              members={growth}
              metric={metric}
              onMetricChange={(m) => navigate({ search: (prev) => ({ ...prev, metric: m }) })}
              range={range}
              onRangeChange={(r) => navigate({ search: (prev) => ({ ...prev, range: r }) })}
            />
          )}
          {tab === "rising" && <RisingList members={rising} />}
          {tab === "influence" && <InfluenceList members={influence} />}
          {tab === "mentions" && <MentionsList members={mentions} />}
          {tab === "active" && <ActiveList members={active} />}
          {tab === "climbs" && <ClimbsList stats={stats} />}
        </main>
      </div>
    </>
  );
}

function LeaderboardList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有成员上榜。</p>;
  // 赛段分割线：相邻成员的下一道大关不同处插线——线上方已持有该称号，线下方正在冲刺
  const rows: ReactNode[] = [];
  let prevSegment = -1;
  members.forEach((m, i) => {
    if (prevSegment !== -1 && m.nextMilestone !== prevSegment) {
      rows.push(<SegmentDivider key={`seg-${m.nextMilestone}`} threshold={m.nextMilestone} />);
    }
    prevSegment = m.nextMilestone;
    rows.push(
      <RevealItem key={m.id} y={16}>
        <LeaderboardMember member={m} rank={i + 1} podium={PODIUM[i]} />
      </RevealItem>
    );
  });
  return <ol className="space-y-3">{rows}</ol>;
}

/** 赛段分割线：标注这道大关的门槛与称号；万粉大关用信号橙突出 */
function SegmentDivider({ threshold }: { threshold: number }) {
  const tenK = threshold === TEN_K;
  return (
    <li className="flex items-center gap-3 pt-3">
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
          tenK ? "border-signal/40 bg-signal/10 text-signal" : "border-line bg-soft-surface text-mist"
        )}
      >
        <Flag className="size-3" aria-hidden="true" />
        跨过 {badge(threshold)} ·「{titleOf(threshold)}」
      </span>
      <div className={cn("h-px flex-1", tenK ? "bg-signal/40" : "bg-line")} />
    </li>
  );
}

/** 总排行行：前三名行带边框渐晕；右侧粉丝量 + 距下一称号进度 */
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
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
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
      <div className="flex w-full shrink-0 flex-col items-start gap-1.5 sm:w-44 sm:items-end">
        {m.latestFollowers == null ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-mist"
            title="首次采集完成后自动上榜"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            首次采集排队中
          </span>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-bold tabular-nums">{fmt(m.latestFollowers)}</span>
              <span className="text-xs text-mist tabular-nums">
                还差 {fmt(m.nextMilestone - m.latestFollowers)}
              </span>
            </div>
            <div className="flex w-full items-center gap-2">
              <GrowProgress
                value={m.progressToNext}
                className="flex-1"
                ariaLabel={`距下一称号「${titleOf(m.nextMilestone)}」进度 ${m.progressToNext}%`}
              />
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist"
                title="下一称号"
              >
                <Flag className="size-3 text-signal" aria-hidden="true" />
                {titleOf(m.nextMilestone)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 成长榜：近 7 天 / 近 30 天口径切换（存 URL，可分享），按所选范围排序，小账号也有机会登顶 */
const METRICS = [
  { key: "growth", label: "涨粉" },
  { key: "views", label: "曝光" },
  { key: "posts", label: "发帖" },
  { key: "replies", label: "评论" },
] as const;
type MetricKey = "growth" | "views" | "posts" | "replies";
const RANGES = [
  { key: 1, label: "今日" },
  { key: 7, label: "近 7 天" },
  { key: 30, label: "近 30 天" },
] as const;

/** 按指标×时间档取值：涨粉取快照差值，曝光/发帖/评论取帖子窗口合计（多维时间榜口径矩阵） */
function metricValue(m: MemberStats, metric: MetricKey, range: 1 | 7 | 30): number {
  if (metric === "growth") return range === 1 ? (m.growth1d ?? 0) : range === 7 ? m.growth7d : m.growth30d;
  if (metric === "views") return range === 1 ? (m.viewsTodayGain ?? 0) : range === 7 ? (m.views7d ?? 0) : (m.views30d ?? 0);
  if (metric === "posts") return range === 1 ? (m.postsToday ?? 0) : range === 7 ? (m.posts7d ?? 0) : (m.posts30d ?? 0);
  return range === 1 ? (m.repliesToday ?? 0) : range === 7 ? (m.replies7d ?? 0) : (m.replies30d ?? 0);
}

function GrowthSection({
  members,
  metric,
  onMetricChange,
  range,
  onRangeChange,
}: {
  members: MemberStats[];
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
  range: 1 | 7 | 30;
  onRangeChange: (r: 1 | 7 | 30) => void;
}) {
  const sorted = [...members].sort((a, b) => metricValue(b, metric, range) - metricValue(a, metric, range));

  return (
    <>
      {/* 本周王者叙事：近 7 天涨粉最多（周冠军 / 月冠军的轻量版） */}
      {range === 7 && metric === "growth" && sorted[0] && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-transparent px-4 py-3">
          <span className="text-sm font-semibold text-mist">本周王者</span>
          <Link to="/members/$id" params={{ id: sorted[0].id }} className="flex items-center gap-2 hover:underline">
            <Avatar url={sorted[0].profileImage} name={sorted[0].displayName ?? sorted[0].handle} className="size-6 shrink-0" />
            <span className="text-sm font-semibold">{sorted[0].displayName ?? sorted[0].handle}</span>
            <span className="text-sm font-bold text-signal tabular-nums">+{fmt(sorted[0].growth7d)}</span>
            <span className="text-xs text-mist">近 7 天</span>
          </Link>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-1 rounded-full border border-line bg-soft-surface p-1">
          {METRICS.map((mt) => (
            <button
              key={mt.key}
              onClick={() => onMetricChange(mt.key)}
              className={cn(
                "h-7 cursor-pointer select-none rounded-full px-3 text-xs font-semibold transition-colors",
                metric === mt.key ? "bg-white text-paper" : "text-mist hover:text-ink"
              )}
            >
              {mt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border border-line bg-soft-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={cn(
                "h-7 cursor-pointer select-none rounded-full px-3 text-xs font-semibold transition-colors",
                range === r.key ? "bg-white text-paper" : "text-mist hover:text-ink"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="space-y-3">
        {sorted.map((m, i) => (
          <RevealItem key={m.id} y={16}>
            <GrowthMember member={m} rank={i + 1} metric={metric} range={range} podium={PODIUM[i]} />
          </RevealItem>
        ))}
      </ol>
    </>
  );
}

/** 成长榜行：前三名与总排行同样的荣誉样式（边框渐晕 + 榜位徽章）；右侧选中口径高亮，另一口径弱化 */
function GrowthMember({
  member: m,
  rank,
  metric,
  range,
  podium,
}: {
  member: MemberStats;
  rank: number;
  metric: MetricKey;
  range: 1 | 7 | 30;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const primary = metricValue(m, metric, range);
  const alternatives = RANGES.filter((r) => r.key !== range);
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
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
          <div className={cn("text-lg font-bold tabular-nums", range === 1 ? "text-signal" : "text-mist")}>
            {metric === "growth" && primary > 0 ? "+" : ""}{fmt(primary)}
          </div>
          <div className="text-xs text-mist">{RANGES.find((r) => r.key === range)?.label}</div>
        </div>
        {alternatives.map((r) => (
          <div key={r.key} className="hidden text-right sm:block">
            <div className="font-semibold tabular-nums text-mist">
              {metric === "growth" && metricValue(m, metric, r.key) > 0 ? "+" : ""}{fmt(metricValue(m, metric, r.key))}
            </div>
            <div className="text-xs text-mist">{r.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 新锐潜力榜：帖均曝光效率最高——粉丝量不大但内容被大量看见的潜力账号（回答「现在该关注谁」） */
function RisingList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有帖子数据，新锐正在路上。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <RisingMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function RisingMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const eff = m.efficiencyVsMedian;
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
          {eff != null && eff >= 1.2 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
              <Zap className="size-3" aria-hidden="true" />
              {eff >= 3 ? "曝光率爆棚" : `同量级 ${eff.toFixed(1)} 倍`}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-mist tabular-nums">
          近 30 天 {m.posts30d ?? 0} 帖 · 互动率 {(m.engagementMedian ?? 0) >= 0 ? `${((m.engagementMedian ?? 0) * 100).toFixed(1)}%` : "—"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold tabular-nums">{m.avgViewsPerPost != null ? fmt(Math.round(m.avgViewsPerPost)) : "—"}</span>
          <span className="text-xs text-mist">帖均曝光</span>
        </div>
        <div className="text-xs text-mist tabular-nums">{m.latestFollowers != null ? `${fmt(m.latestFollowers)} 粉` : "首次采集排队中"}</div>
      </div>
    </div>
  );
}

/** 勤快榜：近 30 天发帖最多的成员（更新频率 = 社群活力的日常证明） */
function ActiveList({ members }: { members: MemberStats[] }) {
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <ActiveMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function ActiveMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const posts30d = m.posts30d ?? 0;
  const perWeek = (posts30d / 4.3).toFixed(1);
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
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
          <div className="flex items-baseline justify-end gap-1">
            <Flame className="size-4 text-signal" aria-hidden="true" />
            <span className="font-bold tabular-nums">{posts30d}</span>
          </div>
          <div className="text-xs text-mist">近 30 天发帖</div>
        </div>
        <div className="text-right">
          <div className="font-bold tabular-nums text-mist">≈{perWeek}/周</div>
          <div className="text-xs text-mist">周均</div>
        </div>
      </div>
    </div>
  );
}

/** 被提及榜：近 30 天被 X 上提及最多的成员（「被讨论热度」） */
function MentionsList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">被提及数据采集中，热度马上就来。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <MentionMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

function MentionMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const count = m.mentionCount30d ?? 0;
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
        <div className="mt-1 text-xs text-mist tabular-nums">
          {m.latestFollowers != null ? `${fmt(m.latestFollowers)} 粉 · ` : ""}近 30 天
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-2xl font-bold text-signal tabular-nums">{count}</span>
        <span className="text-xs text-mist">次被提及</span>
      </div>
    </div>
  );
}

/** 影响力榜：综合指数（0-1000）= 规模 + 增长 + 互动 + 产能；有效粉丝 = 粉丝量 × 质量系数 */
function InfluenceList({ members }: { members: MemberStats[] }) {
  if (members.length === 0) return <p className="text-mist">还没有成员上榜。</p>;
  return (
    <ol className="space-y-3">
      {members.map((m, i) => (
        <RevealItem key={m.id} y={16}>
          <InfluenceMember member={m} rank={i + 1} podium={PODIUM[i]} />
        </RevealItem>
      ))}
    </ol>
  );
}

/** 影响力榜行：排名 + 头像 + 四维分项条 + 指数大数（前三名与总排行同样的荣誉样式） */
function InfluenceMember({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  const inf = m.influence;
  const parts: Array<[string, number, number]> = [
    ["规模", inf?.breakdown.scale ?? 0, 400],
    ["增长", inf?.breakdown.growth ?? 0, 200],
    ["互动", inf?.breakdown.engagement ?? 0, 250],
    ["产能", inf?.breakdown.output ?? 0, 150],
  ];
  return (
    <div
      className={
        podium
          ? `card-lift flex flex-wrap items-center gap-x-3 gap-y-3 rounded-2xl border p-4 sm:gap-x-4 sm:p-5 ${podium.ring}`
          : "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5"
      }
    >
      <div
        className={
          podium
            ? `w-6 shrink-0 bg-gradient-to-br bg-clip-text font-extrabold tabular-nums text-transparent ${podium.rankNum}`
            : "w-6 shrink-0 text-mist tabular-nums"
        }
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          <TitleBadge threshold={m.prevMilestone} />
          <a
            href={xProfileUrl(m.handle)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
        {inf && (
          <div className="mt-2 flex gap-2">
            {parts.map(([label, v, max]) => (
              <div key={label} className="flex-1" title={`${label} ${v} / ${max}`}>
                <div className="flex justify-between text-[10px] leading-none text-mist">
                  <span>{label}</span>
                  <span className="tabular-nums">{v}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-line/70">
                  <div className="h-full rounded-full bg-signal/70" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {inf ? (
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="bg-gradient-to-br from-amber-300 to-amber-600 bg-clip-text text-2xl font-extrabold tabular-nums text-transparent">
              {inf.score}
            </span>
            <span className="text-xs text-mist">/ 1000</span>
          </div>
          <div className="mt-0.5 text-xs text-mist tabular-nums" title={`质量系数 x${inf.qualityMultiplier.toFixed(2)}`}>
            有效粉丝 {fmt(inf.effectiveFollowers)}
          </div>
        </div>
      ) : (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-mist"
          title="首次采集完成后自动上榜"
        >
          <Clock3 className="size-3.5" aria-hidden="true" />
          首次采集排队中
        </span>
      )}
    </div>
  );
}

/** 登阶记录：最近跨过称号大关的成员。行卡与总排行同一视觉语言（头像 + 名字 + 金色称号 chip + 日期） */
function ClimbsList({ stats }: { stats: DashboardStats }) {
  if (stats.recentMilestones.length === 0) return <p className="text-mist">还没有登阶记录，第一枚成就正在路上。</p>;
  // 头像/句柄来自成员表：事件流只带 memberId，联一张 map 取展示数据
  const byId = new Map(stats.members.map((m) => [m.id, m]));
  return (
    <ol className="space-y-3">
      {stats.recentMilestones.map((m) => {
        const member = byId.get(m.memberId);
        const name = m.displayName ?? member?.displayName ?? m.handle;
        return (
          <RevealItem key={`${m.memberId}-${m.threshold}`} y={12}>
            <div className="card-lift flex items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface p-4 sm:gap-x-4 sm:p-5">
              <Avatar url={member?.profileImage} name={name} className="size-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link to="/members/$id" params={{ id: m.memberId }} className="font-semibold underline-offset-4 hover:underline">
                    {name}
                  </Link>
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
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    titleBadgeClass(m.threshold)
                  )}
                  title={`跨过 ${badge(m.threshold)} 大关`}
                >
                  <span aria-hidden="true">🏅</span>
                  {titleOf(m.threshold)}
                  <span className="font-normal text-mist/60 tabular-nums">{badge(m.threshold)}</span>
                </span>
                <span className="text-xs text-mist tabular-nums">{fmtDate(m.achievedAt)} 达成</span>
              </div>
            </div>
          </RevealItem>
        );
      })}
    </ol>
  );
}