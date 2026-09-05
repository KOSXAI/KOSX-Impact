/**
 * 社群总粉丝趋势（Recharts 懒加载包装）：
 * SSR 只输出占位骨架，图表 chunk 水合后按需拉取（图表非 SEO 内容）。
 * 数据点不足 2 天时返回 null（一条线至少要两个点）。
 */
import { Suspense, lazy } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { TrendPoint } from "@/stats";

// 拆出独立 chunk：只在浏览器水合后加载，不进路由主包
const RechartsTrendChart = lazy(() => import("./RechartsTrendChart"));

export function TrendChart({ data, className }: { data: TrendPoint[]; className?: string }) {
  if (data.length < 2) return null;
  return (
    <div className={className} style={{ aspectRatio: "800 / 200" }}>
      <ClientOnly
        fallback={
          <div className="bg-muted/50 h-full w-full rounded-lg border" aria-label="社群趋势加载中" />
        }
      >
        <Suspense fallback={null}>
          <RechartsTrendChart data={data} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
