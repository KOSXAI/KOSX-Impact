/**
 * 社群趋势（总量面积图 / 日增柱状图切换，Recharts 懒加载包装）：
 * SSR 只输出占位骨架，图表 chunk 水合后按需拉取（图表非 SEO 内容）。
 * 数据点不足 2 天时返回 null（一条线至少要两个点）。
 */
import { Suspense, lazy, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { TrendPoint } from "@/stats";

export type TrendMode = "total" | "daily";

// 拆出独立 chunk：只在浏览器水合后加载，不进路由主包
const RechartsTrendChart = lazy(() => import("./RechartsTrendChart"));

const MODES: ReadonlyArray<{ key: TrendMode; label: string }> = [
  { key: "total", label: "总量" },
  { key: "daily", label: "日增" },
];

export function TrendChart({ data, className }: { data: TrendPoint[]; className?: string }) {
  const [mode, setMode] = useState<TrendMode>("total");

  if (data.length < 2) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex justify-end">
        {/* 用全站统一的 SegmentedControl：此前这里自制滑动 thumb 引 motion（首页在关键路径上） */}
        <SegmentedControl value={mode} onChange={setMode} options={MODES} size="sm" ariaLabel="趋势口径" />
      </div>
      {/* 移动端加高（2:1），桌面恢复宽扁（4:1）：窄屏下曲线才有可读的纵向空间 */}
      <div className={cn("aspect-[2/1] sm:aspect-[4/1]")}>
        <ClientOnly
          fallback={<Skeleton className="h-full w-full rounded-lg" aria-label="社群趋势加载中" />}
        >
          <Suspense fallback={null}>
            <RechartsTrendChart data={data} mode={mode} />
          </Suspense>
        </ClientOnly>
      </div>
    </div>
  );
}
