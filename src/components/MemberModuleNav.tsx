import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * 博主模块内部的三视图切换条：榜单 / 广场 / 赛道。
 * 顶栏「博主」涵盖这三个视图（以及成员详情/周报等子路由），
 * 这里在模块内做平级导航，让访客在「看排名 / 找博主 / 按赛道逛」之间自由切换。
 */
const VIEWS = [
  { to: "/leaderboard", label: "榜单" },
  { to: "/members", label: "广场" },
  { to: "/tracks", label: "赛道" },
] as const;

export function MemberModuleNav() {
  const { pathname } = useLocation();
  return (
    <div className="mt-10 flex w-full items-center gap-1 rounded-full border border-line bg-soft-surface p-1 sm:inline-flex sm:w-auto">
      {VIEWS.map((v) => {
        const active = pathname === v.to || (v.to === "/members" && pathname.startsWith("/members/"));
        return (
          <Link
            key={v.label}
            to={v.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-9 flex-1 rounded-full px-5 text-sm font-semibold transition-colors sm:flex-none",
              active ? "bg-white text-paper shadow-sm" : "text-mist hover:text-ink"
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
