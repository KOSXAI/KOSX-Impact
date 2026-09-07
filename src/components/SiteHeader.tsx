import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { GITHUB_URL, OFFICIAL_SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** GitHub 官方 octocat 标记（lucide 已移除品牌图标，内联 SVG 用 currentColor 跟主题） */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * 全站导航：按优先级渐进显示——越重要的越先出现，放不下的收进窄屏汉堡面板。
 * - 总览/榜单/成员/赛道：所有宽度恒显（320px 起四项即「绰绰有余」，主流手机宽度全可见）
 * - 内容 ≥340px · 关于 ≥640px · 官网 ≥900px
 * - 访问 /tracks/xxx、/members/xxx 时对应项保持高亮
 */
const NAV = [
  { to: "/", label: "总览", exact: true, cls: "" },
  { to: "/leaderboard", label: "榜单", exact: false, cls: "" },
  { to: "/members", label: "成员", exact: false, cls: "" },
  { to: "/tracks", label: "赛道", exact: false, cls: "" },
  { to: "/posts", label: "内容", exact: false, cls: "hidden min-[360px]:inline-flex" },
  { to: "/about", label: "关于", exact: false, cls: "hidden sm:inline-flex" },
] as const;

const NAV_BASE_CLS =
  "shrink-0 rounded-full px-2.5 py-1.5 text-sm font-semibold text-mist transition-colors hover:text-ink lg:px-3";

/**
 * 全站统一头部（菜单居中，加入追踪在页脚 SiteFooter）。
 * 布局 Grid 三段式 grid-cols-[1fr_auto_1fr]：左 logo / 中导航 / 右 GitHub·汉堡，1fr 严格均分保证导航像素级居中。
 * - 窄屏（<md）：logo 隐藏让位，导航按宽度渐进显示——总览/榜单恒显，成员/赛道/内容/关于随宽度加入，
 *   放不下的收进汉堡下拉面板（竖排大点击区，点选即关，GitHub 随面板出现）
 * - 宽屏（≥md）：logo | 导航居中整行显示（官网在「关于」右侧，同链接风格）| GitHub
 */
export function SiteHeader({ containerClassName = "max-w-5xl" }: { containerClassName?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
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

        {/* 中格：导航 + 窄屏汉堡（作为导航流末尾的整体，一起居中，不挤占独立空间） */}
        <nav className="flex items-center justify-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={n.exact ? { exact: true } : undefined}
              activeProps={{ className: "bg-soft-surface text-ink" }}
              className={cn(NAV_BASE_CLS, n.cls)}
            >
              {n.label}
            </Link>
          ))}
          <a
            href={OFFICIAL_SITE_URL}
            target="_blank"
            rel="noreferrer"
            title="KOSX 官网"
            className={cn(NAV_BASE_CLS, "hidden items-center gap-0.5 min-[900px]:inline-flex")}
          >
            官网
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <button
            type="button"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-mist transition-colors hover:border-signal/40 hover:text-ink md:hidden"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </nav>

        {/* 右格：GitHub（宽屏） */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            title="KOSX-Impact 开源仓库"
            className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink md:inline-flex"
          >
            <GitHubIcon className="size-4" />
            GitHub
          </a>
        </div>
      </div>

      {/* 窄屏导航面板：收容放不下的导航项（七项 + 官网全量），点任一导航项即关 */}
      {menuOpen && (
        <div className="absolute inset-x-0 top-full z-50 border-b border-line/60 bg-paper/95 backdrop-blur-md md:hidden">
          <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-4">
            <nav className="flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={n.exact ? { exact: true } : undefined}
                  onClick={() => setMenuOpen(false)}
                  activeProps={{ className: "bg-soft-surface text-ink" }}
                  className="rounded-xl px-4 py-3 text-base font-semibold text-mist transition-colors hover:bg-soft-surface hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
              <a
                href={OFFICIAL_SITE_URL}
                target="_blank"
                rel="noreferrer"
                title="KOSX 官网"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl px-4 py-3 text-base font-semibold text-mist transition-colors hover:bg-soft-surface hover:text-ink"
              >
                官网
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                title="KOSX-Impact 开源仓库"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
              >
                <GitHubIcon className="size-4" />
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}