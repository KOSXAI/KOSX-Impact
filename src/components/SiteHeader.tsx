import { Link } from "@tanstack/react-router";
import { GITHUB_URL } from "@/lib/site";
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
 * 全站统一头部：左侧 KOSX 标识（回看板首页），右侧 GitHub 开源仓库。
 * sticky + 半透明毛玻璃，滚动时内容从下方穿过仍可辨识。
 */
export function SiteHeader({ containerClassName = "max-w-5xl" }: { containerClassName?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-14 items-center justify-between px-[clamp(18px,2.2vw,34px)]",
          containerClassName
        )}
      >
        <Link to="/" aria-label="返回看板" className="flex shrink-0 items-center">
          <img src="/kosx-logo-white.png" alt="KOSX.ai" className="h-6 w-auto" />
        </Link>
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
    </header>
  );
}
