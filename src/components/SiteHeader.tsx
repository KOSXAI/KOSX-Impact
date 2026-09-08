import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SearchDialog } from "@/components/SearchDialog";
import { cn } from "@/lib/utils";

/**
 * 全站导航：门少屋深——一级菜单只保留「独立进入心智」：
 * - 首页 /：社群怎么样（含 /daily 日报 = 首页的时间切片）
 * - 博主 /：谁值得关注（成员实体，涵盖 /leaderboard 榜单 / /members 广场 / /tracks 赛道）
 * - 内容 /：他们产出什么（帖子实体）
 * 三项 320px 全放得下，无汉堡、无渐进隐藏；站外链接与站点入口（官网/GitHub/关于/加入追踪）归页脚。
 * 激活态：/ 与 /daily 高亮「首页」；/leaderboard、/members、/tracks 及其子路由高亮「博主」。
 */
const NAV = [
  { label: "首页", match: (p: string) => p === "/" || p.startsWith("/daily") },
  {
    label: "博主",
    match: (p: string) =>
      p.startsWith("/members") || p.startsWith("/leaderboard") || p.startsWith("/tracks"),
  },
  { label: "内容", match: (p: string) => p.startsWith("/posts") },
] as const;

const NAV_BASE_CLS =
  "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-mist transition-colors hover:text-ink";

export function SiteHeader({ containerClassName = "max-w-5xl" }: { containerClassName?: string }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 邀请裂变：分享链接带 ?invite=成员id，落地即记住邀请人（新成员自助加入时上报一次）
  useEffect(() => {
    try {
      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite) localStorage.setItem("kosx:invited_by", invite);
    } catch {
      /* 隐私模式等写不进去就静默 */
    }
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3",
            "px-[clamp(18px,2.2vw,34px)]",
            containerClassName
          )}
        >
          {/* 左格：窄屏留白让导航严格居中，宽屏放 logo */}
          <div className="flex items-center">
            <Link to="/" aria-label="KOSX 万粉影响力计划" className="hidden items-center md:flex">
              <img src="/kosx-logo-white.png" alt="KOSX.ai" className="h-6 w-auto" />
            </Link>
          </div>

          {/* 中格：三项导航居中 */}
          <nav className="flex items-center justify-center gap-1">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <Link
                  key={n.label}
                  to={n.label === "首页" ? "/" : n.label === "博主" ? "/members" : "/posts"}
                  aria-current={active ? "page" : undefined}
                  className={cn(NAV_BASE_CLS, active && "bg-soft-surface text-ink")}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {/* 右格：搜索 */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="快速搜索成员与赛道"
              title="搜索（⌘K）"
              className="inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-mist transition-colors hover:border-signal/40 hover:text-ink cursor-pointer select-none active:scale-95 duration-150"
            >
              <Search className="size-3.5 sm:size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
