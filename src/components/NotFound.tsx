import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

/**
 * 全站 404 兜底卡：统一视觉（与错误页同款 padding 节奏），带返回链接。
 * 用在根 404 与各参数路由的 notFoundComponent——_shell 子路由的页头由壳层提供。
 */
export function NotFound({ title, description }: { title: string; description?: string }) {
  useEffect(() => {
    document.title = `${title} · KOSX 万粉影响力计划`;
  }, [title]);

  return (
    <main className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      {description && <p className="mt-3 text-mist">{description}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-9 items-center rounded-full bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:bg-wash-strong hover:text-ink"
        >
          返回首页
        </Link>
        <Link
          to="/members"
          className="inline-flex h-9 items-center rounded-full bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:bg-wash-strong hover:text-ink"
        >
          成员广场
        </Link>
      </div>
    </main>
  );
}
