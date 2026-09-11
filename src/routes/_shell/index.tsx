import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber, Reveal } from "@/components/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChampionCards } from "@/components/home/ChampionCards";
import { WindowGrid } from "@/components/home/WindowGrid";
import { TitleDistribution } from "@/components/home/TitleDistribution";
import { CalendarRange, Newspaper, Zap } from "lucide-react";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { fmt, fmtDate } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

export const Route = createFileRoute("/_shell/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: SITE_NAME },
      { name: "description", content: `${SITE_NAME}：追踪每一位成员冲刺一个个称号大关的过程，看见每个人的成长，也看见整个社群正在产生多大的影响。` },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = Route.useLoaderData();
  const today = new Date().toISOString().slice(0, 10);
  const todayClimbers = new Set(
    stats.recentMilestones.filter((m) => m.achievedAt.slice(0, 10) === today).map((m) => m.memberId)
  ).size;
  const totalClimbs = stats.members.reduce((sum, m) => sum + m.climbs, 0);
  // 最新采集时间 = 全成员最新一点快照。固定用 ISO 字段直切，不用 toLocaleString，避免 SSR/水化时区错位闪变
  const latestSnapshotAt = stats.members.reduce<string | null>(
    (acc, m) => (m.latestRecordedAt && (!acc || m.latestRecordedAt > acc) ? m.latestRecordedAt : acc),
    null
  );
  const fans = stats.fansSample;

  return (
    <div className="mx-auto max-w-6xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      {/* 第一屏 · 数据大屏：双特大数定基调，纯统计 */}
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
      </Reveal>

      <Reveal delay={0.04}>
        <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
            <div className="text-sm font-medium text-mist">社群累计粉丝</div>
            <AnimatedNumber
              value={stats.totalFollowers}
              className="mt-2 block text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl"
            />
            {fans && fans.sampleSize > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-baseline gap-8" tabIndex={0}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-mist">粉丝过万占比</span>
                      <span className="text-xl font-extrabold text-ink tabular-nums">
                        {fans.pct10k != null ? `${fans.pct10k.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-mist">认证占比</span>
                      <span className="text-xl font-extrabold text-ink tabular-nums">
                        {fans.verifiedPct != null ? `${fans.verifiedPct.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  对全成员粉丝圈抽样 {fmt(fans.sampleSize)} 个账号加权统计（月度采样），粉丝质量的最直接证据
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="rounded-2xl bg-signal/5 shadow-[var(--panel-elev)] p-6 sm:p-8">
            <div className="text-sm font-medium text-mist">近 30 天新增</div>
            <AnimatedNumber
              value={stats.totalGrowth30d}
              prefix="+"
              className="mt-2 block text-5xl font-extrabold tracking-tight text-signal tabular-nums sm:text-6xl"
            />
            <div className="mt-3 text-xs font-semibold text-mist tabular-nums">
              {stats.members.length} 位成员 · {stats.tenKMembers} 位已过万粉
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="万粉成员" value={stats.tenKMembers} />
          <StatCard label="追踪成员" value={stats.members.length} />
          <StatCard label="已领称号" value={totalClimbs} />
          <StatCard
            label="今日登阶"
            value={todayClimbers > 0 ? todayClimbers : "—"}
            hint={todayClimbers > 0 ? "人" : undefined}
          />
        </div>
      </Reveal>

      {/* 里程碑分布 + 总量趋势：大屏收官两件 */}
      <Reveal delay={0.1}>
        <section className="mt-8 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">里程碑分布</h2>
            <span className="text-xs font-semibold text-mist tabular-nums">
              {stats.members.length} 位成员 · 已领 {totalClimbs} 枚称号
            </span>
          </div>
          <TitleDistribution members={stats.members} />
          {stats.trend.length >= 2 && (
            <div className="mt-6 border-t border-line pt-6">
              <TrendChart data={stats.trend} />
            </div>
          )}
        </section>
      </Reveal>

      {/* 报告窗格：日报/能量报告/年报缩略入口 + 外部信号收尾 */}
      <Reveal delay={0.12}>
        <div className="mt-8 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
          <h2 className="text-xl font-bold">报告</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link to="/daily" className="rounded-xl bg-soft-surface px-4 py-3.5 transition-colors hover:bg-wash-strong">
              <div className="flex items-center gap-2">
                <Newspaper className="size-4 shrink-0 text-signal" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-ink">社群日报</span>
                <span className="ml-auto shrink-0 text-xs text-mist tabular-nums">{today}</span>
              </div>
              <div className="mt-1 text-xs text-mist tabular-nums">
                {todayClimbers > 0 ? `今日登阶 ${todayClimbers} 条` : "今天还没有登阶"}
              </div>
            </Link>
            <Link to="/report" className="rounded-xl bg-soft-surface px-4 py-3.5 transition-colors hover:bg-wash-strong">
              <div className="flex items-center gap-2">
                <Zap className="size-4 shrink-0 text-signal" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-ink">社群能量报告</span>
                <span className="ml-auto shrink-0 text-xs text-mist tabular-nums">本周</span>
              </div>
              <div className="mt-1 text-xs text-mist tabular-nums">覆盖 {stats.members.length} 位成员</div>
            </Link>
            <Link to="/annual" className="rounded-xl bg-soft-surface px-4 py-3.5 transition-colors hover:bg-wash-strong">
              <div className="flex items-center gap-2">
                <CalendarRange className="size-4 shrink-0 text-signal" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-ink">年度报告</span>
                <span className="ml-auto shrink-0 text-xs text-mist tabular-nums">{today.slice(0, 4)}</span>
              </div>
              <div className="mt-1 text-xs text-mist tabular-nums">累计粉丝 {fmt(stats.totalFollowers)}</div>
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {stats.followNet && stats.followNet.mutualPairs > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-soft-surface px-3 py-1 text-xs font-semibold text-mist transition-colors hover:text-ink"
                    tabIndex={0}
                  >
                    🤝 成员互相关注 <b className="text-ink tabular-nums">{stats.followNet.mutualPairs}</b> 对
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  定期核对全部成员在 X 上的真实互相关注（不是帖子里的 @），社群连接密度的硬证据
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </Reveal>

      {/* 第二屏 · 冠军卡三联：今天谁在赢 */}
      <Reveal delay={0.14}>
        <div className="mt-10">
          <h2 className="text-xl font-bold">今天的冠军</h2>
          <div className="mt-4">
            <ChampionCards stats={stats} />
          </div>
        </div>
      </Reveal>

      {/* 第三屏 · 榜单窗格墙：九视图 + 内容热点 + 社群话题 */}
      <Reveal delay={0.16}>
        <div className="mt-10">
          <h2 className="text-xl font-bold">榜单窗口</h2>
          <div className="mt-4">
            <WindowGrid stats={stats} />
          </div>
        </div>
      </Reveal>

      {/* 新鲜度注脚 */}
      {latestSnapshotAt && (
        <p className="mt-10 text-center text-xs text-mist tabular-nums">
          数据更新于 {fmtDate(latestSnapshotAt).slice(5)} {latestSnapshotAt.slice(11, 16)} UTC · 每小时自动采集
        </p>
      )}
    </div>
  );
}
