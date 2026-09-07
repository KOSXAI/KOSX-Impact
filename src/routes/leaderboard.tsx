import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { DashboardStats, MemberStats } from "@/stats";
import { GrowProgress, Reveal, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TitleBadge, titleBadgeClass } from "@/components/member/TitleBadge";
import { SiteHeader } from "@/components/SiteHeader";
import { Flag, Clock3 } from "lucide-react";
import { TEN_K, titleOf } from "@/milestones";
import { fmt, fmtDate, badge } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: `榜单 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME} 四大榜单：总排行看绝对影响力、成长榜看近期进步、影响力榜看四维综合、登阶记录看最近拿下的称号。` },
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

type TabKey = "leaderboard" | "growth" | "climbs" | "influence";

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

  const [tab, setTab] = useState<TabKey>("leaderboard");
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "leaderboard", label: "总排行", count: leaderboard.length },
    { key: "growth", label: "成长榜", count: growth.length },
    { key: "influence", label: "影响力", count: influence.length },
    { key: "climbs", label: "登阶记录", count: stats.recentMilestones.length },
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">榜单</h1>
          <p className="mt-3 max-w-2xl text-mist">
            总排行看绝对影响力，成长榜看近期进步，影响力榜看四维综合，登阶记录看最近拿下的称号。
          </p>
        </Reveal>

        {/* Tab 切换：总排行 / 成长榜 / 影响力 / 登阶记录 */}
        <div className="mt-10 flex w-full items-center gap-1 rounded-full border border-line bg-soft-surface p-1 sm:inline-flex sm:w-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-10 flex-1 rounded-full px-4 text-sm font-semibold transition-colors sm:h-9 sm:flex-none sm:px-5",
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
          {tab === "influence" && <InfluenceList members={influence} />}
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
              "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
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
            <GrowthMember member={m} rank={i + 1} range={range} podium={PODIUM[i]} />
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
  range,
  podium,
}: {
  member: MemberStats;
  rank: number;
  range: 7 | 30;
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
        <div className={cn("text-right", range !== 7 && "hidden sm:block")}>
          <div className={cn("font-bold tabular-nums", range === 7 ? "text-signal" : "text-mist")}>
            +{fmt(m.growth7d)}
          </div>
          <div className="text-xs text-mist">近 7 天</div>
        </div>
        <div className={cn("text-right", range !== 30 && "hidden sm:block")}>
          <div className={cn("font-bold tabular-nums", range === 30 ? "text-signal" : "text-mist")}>
            +{fmt(m.growth30d)}
          </div>
          <div className="text-xs text-mist">近 30 天</div>
        </div>
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