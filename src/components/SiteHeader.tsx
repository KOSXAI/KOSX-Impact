import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { cycleTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * 搜索面板懒加载：它自带 Radix Dialog 与整份名册 JSON（成员搜索数据源），
 * 静态引入会把这些压进 entry chunk 变成每页首屏成本，而它只在点击 / ⌘K 之后才存在。
 * 打开时才挂载 + 按需拉取，首屏只留一个搜索图标按钮。
 */
const SearchDialog = lazy(() =>
  import("@/components/SearchDialog").then((m) => ({ default: m.SearchDialog }))
);

/**
 * 全站导航：门少屋深——一级菜单只保留「独立进入心智」，共四项：
 * - 首页 /：社群怎么样
 * - 博主 /members：谁值得关注（成员实体，博主库 = 视图×筛选×布局的一页 + /tracks/{slug} 赛道详情）
 * - 内容 /posts：他们产出什么（帖子实体）
 * - 报告 /reports：日报 /daily、周期报告 /report、年度 /annual 的统一入口
 * 四项在 320px 下全放得下（<sm 收紧内边距，见 NAV_BASE_CLS 与表头栅格），无汉堡、无渐进隐藏；
 * 站外链接与站点入口（官网/GitHub/关于/加入追踪）归页脚。
 * 激活态互斥：首页只匹配 `/`；/daily 只归「报告」；/members、/tracks 及其子路由高亮「博主」。
 * `to` 用 as const 保持字面量类型，满足 TanStack Router 的 Link 类型检查。
 */
const NAV = [
  { label: "首页", to: "/", match: (p: string) => p === "/" },
  {
    label: "博主",
    to: "/members",
    match: (p: string) => p.startsWith("/members") || p.startsWith("/tracks"),
  },
  { label: "内容", to: "/posts", match: (p: string) => p.startsWith("/posts") },
  {
    label: "报告",
    to: "/reports",
    match: (p: string) => p.startsWith("/report") || p.startsWith("/daily") || p.startsWith("/annual"),
  },
] as const;

const NAV_BASE_CLS =
  // 高度 20(行高)+16(py-2)=36px 触控目标；<sm 水平内边距收紧到 8px，保证 320px 不溢出
  "shrink-0 rounded-full px-2 py-2 text-sm font-semibold text-mist transition-colors hover:text-ink sm:px-3";

/** 头部主题切换钮的三态文案：点击按 system → light → dark 循环 */
const THEME_META: Record<ThemeMode, { label: string; next: string }> = {
  system: { label: "跟随系统", next: "浅色模式" },
  light: { label: "浅色模式", next: "深色模式" },
  dark: { label: "深色模式", next: "跟随系统" },
};

export function SiteHeader({ containerClassName = "max-w-5xl" }: { containerClassName?: string }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { mode, setMode } = useTheme();
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
            // <sm 左格（无 logo）不占位，导航靠左 + 按钮靠右两列撑满，320px 不溢出；
            // ≥sm 恢复三列，让导航严格居中
            "mx-auto grid h-14 grid-cols-[auto_auto] items-center justify-between gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:justify-normal sm:gap-3",
            "px-[clamp(18px,2.2vw,34px)]",
            containerClassName
          )}
        >
          {/* 左格：≥sm 留白让导航严格居中，≥md 放 logo；<sm 不渲染以免占列宽 */}
          <div className="hidden items-center sm:flex">
            <Link to="/" aria-label="KOSX 万粉影响力计划" className="hidden items-center md:flex">
              {/* 品牌双套：白标配深色模式，黑标（同款橙点）配浅色模式 */}
              <img src="/kosx-logo-white.png" alt="KOSX.ai" className="hidden h-6 w-auto dark:block" />
              <img src="/kosx-logo-dark.png" alt="" aria-hidden="true" className="h-6 w-auto dark:hidden" />
            </Link>
          </div>

          {/* 中格：四项导航（≥sm 居中；<sm 间距压到 2px） */}
          <nav className="flex items-center justify-center gap-0.5 sm:gap-1">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(NAV_BASE_CLS, active && "bg-surface text-ink shadow-sm")}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {/* 右格：主题切换 + 搜索 */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setMode(cycleTheme(mode))}
              aria-label={`主题：${THEME_META[mode].label}，点击切换为${THEME_META[mode].next}`}
              title={`主题：${THEME_META[mode].label}（点击切换为${THEME_META[mode].next}）`}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-[var(--panel-elev)] text-mist transition-colors hover:bg-wash-strong hover:text-ink cursor-pointer select-none active:scale-95 duration-150"
            >
              {/* 图标由 html[data-theme-mode] 纯 CSS 切换，水合前后零闪烁 */}
              <Sun className="theme-icon theme-icon-light size-4" aria-hidden="true" />
              <Moon className="theme-icon theme-icon-dark size-4" aria-hidden="true" />
              <Monitor className="theme-icon theme-icon-system size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="快速搜索成员与赛道"
              title="搜索（⌘K）"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-[var(--panel-elev)] text-mist transition-colors hover:bg-wash-strong hover:text-ink cursor-pointer select-none active:scale-95 duration-150"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {/* 只在打开过之后才挂载：首次点击时按需加载面板 chunk */}
      {searchOpen && (
        <Suspense fallback={null}>
          <SearchDialog open onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </>
  );
}
