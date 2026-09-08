/**
 * 社群趋势（总量面积图 / 日增柱状图切换，Recharts 懒加载包装）：
 * SSR 只输出占位骨架，图表 chunk 水合后按需拉取（图表非 SEO 内容）。
 * 数据点不足 2 天时返回 null（一条线至少要两个点）。
 */
import { Suspense, lazy, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "motion/react";
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
      <div className="mb-3 flex justify-end">
        <div className="inline-flex items-center rounded-full border border-line bg-soft-surface p-0.5">
          {MODES.map((m) => {
            const isActive = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative h-7 rounded-full px-3 text-xs font-semibold transition-colors duration-200 select-none cursor-pointer",
                  isActive ? "text-paper" : "text-mist hover:text-ink"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="trendModeActive"
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{m.label}</span>
              </button>
            );
          })}
        </div>
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
