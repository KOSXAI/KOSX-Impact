import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { fetchDashboard } from "@/data.functions";
import { LEADERBOARD_TABS, MemberModuleHeader } from "@/components/member/MemberModuleHeader";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { GrowthSection } from "@/components/leaderboard/GrowthList";
import { ActiveList, InfluenceList, MentionsList, RisingList } from "@/components/leaderboard/MiniLists";
import { ClimbsList } from "@/components/leaderboard/ClimbsList";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/_creators/leaderboard")({
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

  // 子榜口径（键/文案来自 MemberModuleHeader 的共享常量）× 各榜成员数
  const tabCounts: Record<TabKey, number> = {
    leaderboard: leaderboard.length,
    growth: growth.length,
    rising: rising.length,
    influence: influence.length,
    mentions: mentions.length,
    active: active.length,
    climbs: stats.recentMilestones.length,
  };
  const tabs = LEADERBOARD_TABS.map((t) => ({ ...t, count: tabCounts[t.key] }));

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        {/* 博主模块统一页头：标题 + 三视图门牌卡（榜单 / 广场 / 赛道） */}
        <MemberModuleHeader view="leaderboard" stats={stats} title="榜单" />

        {/* 榜内子榜切换（模块门牌下的第二级） */}
        <div className="mt-6 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-soft-surface p-1 sm:inline-flex sm:w-auto">
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
