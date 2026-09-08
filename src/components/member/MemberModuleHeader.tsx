import { Link, useLocation } from "@tanstack/react-router";
import { Shapes, Trophy, Users, type LucideIcon } from "lucide-react";
import type { DashboardStats } from "@/stats";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";

/** 博主模块的三视图：榜单 / 广场 / 赛道（顶栏「博主」覆盖的三个平级入口，含各自子路由） */
const VIEWS = [
  { key: "leaderboard", to: "/leaderboard", label: "榜单", icon: Trophy, match: (p: string) => p.startsWith("/leaderboard") },
  { key: "members", to: "/members", label: "广场", icon: Users, match: (p: string) => p.startsWith("/members") },
  { key: "tracks", to: "/tracks", label: "赛道", icon: Shapes, match: (p: string) => p.startsWith("/tracks") },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];
type ViewTo = (typeof VIEWS)[number]["to"];

/** 榜单视图的七张子榜（键与文案的唯一出处，计数由榜单页按数据填充） */
export const LEADERBOARD_TABS = [
  { key: "leaderboard", label: "总排行" },
  { key: "growth", label: "成长榜" },
  { key: "rising", label: "新锐" },
  { key: "influence", label: "影响力" },
  { key: "mentions", label: "被提及" },
  { key: "active", label: "勤快" },
  { key: "climbs", label: "登阶记录" },
] as const;

/**
 * 博主模块的统一页头：大标题 + 一句话描述 + 三视图门牌卡。
 * 三个视图（/leaderboard /members /tracks）共用同一结构，模块内处处一个长相；
 * 门牌卡带实时计数（几张榜 / 几位博主 / 几条赛道），既是切换导航也是模块速览。
 */
export function MemberModuleHeader({
  view,
  stats,
  title,
  description,
}: {
  /** 当前视图键（决定哪张门牌卡点亮） */
  view: ViewKey;
  /** 计数用：成员总数与有成员的赛道数（三个视图的 loader 都来自 fetchDashboard） */
  stats: Pick<DashboardStats, "members" | "trackStats">;
  title: string;
  description: string;
}) {
  const { pathname } = useLocation();
  const counts: Record<ViewKey, string> = {
    leaderboard: `${LEADERBOARD_TABS.length} 张榜`,
    members: `${stats.members.length} 位博主`,
    tracks: `${stats.trackStats.filter((s) => s.memberCount > 0).length} 条赛道`,
  };
  return (
    <div>
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-mist sm:text-base">{description}</p>
      </Reveal>
      <Reveal y={14} delay={0.05}>
        <nav aria-label="博主模块视图" className="mt-7 grid max-w-md grid-cols-3 gap-2 sm:mt-9 sm:gap-3">
          {VIEWS.map((v) => (
            <ModuleDoor
              key={v.to}
              to={v.to}
              label={v.label}
              icon={v.icon}
              count={counts[v.key]}
              active={v.match(pathname) || view === v.key}
            />
          ))}
        </nav>
      </Reveal>
    </div>
  );
}

/** 门牌卡：图标底座 + 视图名 + 实时计数。当前视图信号橙点亮，其余 hover 抬升 */
function ModuleDoor({
  to,
  label,
  icon: Icon,
  count,
  active,
}: {
  to: ViewTo;
  label: string;
  icon: LucideIcon;
  count: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex flex-col items-start gap-2 select-none rounded-2xl border p-3 transition-all duration-300 sm:p-4",
        active
          ? "border-signal/50 bg-signal/8 shadow-[0_0_20px_rgba(255,106,0,0.12)]"
          : "border-line bg-soft-surface hover:-translate-y-0.5 hover:border-white/20 hover:bg-surface"
      )}
    >
      <span className="icon-dock inline-flex size-9 shrink-0 items-center justify-center sm:size-10">
        <Icon
          className={cn("size-4 sm:size-[18px]", active ? "text-signal" : "text-mist transition-colors group-hover:text-ink")}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-bold sm:text-[15px]", active ? "text-ink" : "text-mist transition-colors group-hover:text-ink")}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-mist tabular-nums">{count}</span>
      </span>
    </Link>
  );
}
