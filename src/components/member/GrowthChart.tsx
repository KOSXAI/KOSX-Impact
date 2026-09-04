/**
 * 成员成长曲线（Recharts）。沿用旧版内联 SVG 的取值逻辑：
 * Y 轴以数据范围为主；目标线离数据太远（>2 倍数据跨度）时不纳入，
 * 仅在图内上沿以虚线标注，避免曲线被压成一条线。
 *
 * Recharts 体积大（约 800KB 未压缩），通过 ClientOnly + React.lazy 做客户端
 * 懒加载：SSR 只输出占位骨架，图表 chunk 在水合后按需拉取（图表非 SEO 内容）。
 */
import { Suspense, lazy } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { fmt } from "@/lib/format";

type Snapshot = { followers: number; recordedAt: string };

// 拆出独立 chunk：只在浏览器水合后加载，不进路由主包
const RechartsGrowthChart = lazy(() => import("./RechartsGrowthChart"));

export function GrowthChart({
  snapshots,
  goal,
  className,
}: {
  snapshots: Snapshot[];
  goal: number;
  className?: string;
}) {
  if (snapshots.length === 0) {
    return <p className="text-muted-foreground py-6 text-sm">还没有数据，加入追踪后每天更新。</p>;
  }

  return (
    <div className={className} style={{ aspectRatio: "800 / 240" }}>
      <ClientOnly
        fallback={
          <div
            className="bg-muted/50 flex h-full w-full items-center justify-center rounded-lg border"
            aria-label="成长曲线加载中"
          >
            <span className="text-muted-foreground text-sm">图表加载中…</span>
          </div>
        }
      >
        <Suspense fallback={null}>
          <RechartsGrowthChart snapshots={snapshots} goal={goal} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}