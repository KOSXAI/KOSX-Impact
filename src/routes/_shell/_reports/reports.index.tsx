import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import { Reveal } from "@/components/motion";
import { fmt } from "@/lib/format";
import { CalendarRange, Newspaper, Zap } from "lucide-react";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * 报告板块落地页：日报 / 社群能量报告 / 年度报告三入口。
 * 报告是传播实体（恒定 URL 可转发），给一级导航入口。
 */
export const Route = createFileRoute("/_shell/_reports/reports/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: `报告 · ${SITE_NAME}` },
      { property: "og:title", content: `报告 · ${SITE_NAME}` },
      { property: "og:url", content: `${SITE_URL}/reports` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/reports` }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const stats = Route.useLoaderData();
  const today = new Date().toISOString().slice(0, 10);
  const todayClimbers = stats.recentMilestones.filter((m) => m.achievedAt.slice(0, 10) === today).length;
  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">报告</h1>
      </Reveal>

      {/* 三份报告入口（门牌卡语言） */}
      <Reveal delay={0.04}>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/daily"
            aria-label="社群日报"
            className="card-lift panel-card p-6"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-wash text-signal">
              <Newspaper className="size-5" aria-hidden="true" />
            </span>
            <div className="mt-4 flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold">社群日报</span>
              <span className="shrink-0 text-xs font-semibold text-mist tabular-nums">{today}</span>
            </div>
            <div className="mt-1 text-xs text-mist tabular-nums">今日登阶 {todayClimbers} 条</div>
          </Link>
          <Link
            to="/report"
            aria-label="社群能量报告"
            className="card-lift panel-card p-6"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-wash text-signal">
              <Zap className="size-5" aria-hidden="true" />
            </span>
            <div className="mt-4 flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold">社群能量报告</span>
              <span className="shrink-0 text-xs font-semibold text-mist tabular-nums">本周</span>
            </div>
            <div className="mt-1 text-xs text-mist tabular-nums">覆盖 {stats.members.length} 位成员</div>
          </Link>
          <Link
            to="/annual"
            aria-label="年度报告"
            className="card-lift panel-card p-6"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-wash text-signal">
              <CalendarRange className="size-5" aria-hidden="true" />
            </span>
            <div className="mt-4 flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold">年度报告</span>
              <span className="shrink-0 text-xs font-semibold text-mist tabular-nums">{today.slice(0, 4)}</span>
            </div>
            <div className="mt-1 text-xs text-mist tabular-nums">累计粉丝 {fmt(stats.totalFollowers)}</div>
          </Link>
        </div>
      </Reveal>

    </div>
  );
}
