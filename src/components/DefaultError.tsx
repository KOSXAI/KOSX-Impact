import { useEffect } from "react";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";

/**
 * 全站默认错误页：任何 loader / 渲染抛错时的兜底（中文 + 站点视觉，
 * 替代 TanStack 默认的英文原始错误页）。_shell 子路由出错时壳层页头仍在，
 * 这里不再渲染 SiteHeader。
 */
export function DefaultError({ error }: ErrorComponentProps) {
  useEffect(() => {
    document.title = "出错了 · KOSX 万粉影响力计划";
  }, []);
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <h1 className="text-3xl font-bold">页面出错了</h1>
      <p className="mt-3 text-mist">数据加载时出了点问题，通常是短暂故障，稍后重试即可恢复。</p>
      <p className="mt-4 rounded-xl border border-line bg-soft-surface px-4 py-3 text-xs text-mist break-all">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex h-9 items-center rounded-full bg-signal px-4 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
        >
          刷新重试
        </button>
        <Link
          to="/"
          className="inline-flex h-9 items-center rounded-full border border-line bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
