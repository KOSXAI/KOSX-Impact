/**
 * 社群趋势（总量面积图 / 日增柱状图切换，Recharts 懒加载包装）：
 * SSR 只输出占位骨架，图表 chunk 水合后按需拉取（图表非 SEO 内容）。
 * 数据点不足 2 天时返回 null（一条线至少要两个点）。
 */
import { Suspense, lazy, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/stats";

export type TrendMode = "total" | "daily";

// 拆出独立 chunk：只在浏览器水合后加载，不进路由主包
const RechartsTrendChart = lazy(() => import("./RechartsTrendChart"));

const MODES: Array<{ key: TrendMode; label: string }> = [
  { key: "total", label: "总量" },
  { key: "daily", label: "日增" },
];

export function TrendChart({ data, className }: { data: TrendPoint[]; className?: string }) {
  const [mode, setMode] = useState<TrendMode>("total");

  if (data.length < 2) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex justify-end gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
              mode === m.key ? "bg-white text-paper" : "text-mist hover:text-ink"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {/* 移动端加高（2:1），桌面恢复宽扁（4:1）：窄屏下曲线才有可读的纵向空间 */}
      <div className={cn("aspect-[2/1] sm:aspect-[4/1]", className)}>
        <ClientOnly
          fallback={
            <div className="bg-muted/50 h-full w-full rounded-lg border" aria-label="社群趋势加载中" />
          }
        >
          <Suspense fallback={null}>
            <RechartsTrendChart data={data} mode={mode} />
          </Suspense>
        </ClientOnly>
      </div>
    </div>
  );
}
