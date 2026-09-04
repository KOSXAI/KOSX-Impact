/**
 * 成员成长曲线（Recharts）。沿用旧版内联 SVG 的取值逻辑：
 * Y 轴以数据范围为主；目标线离数据太远（>2 倍数据跨度）时不纳入，
 * 仅在图内上沿以虚线标注，避免曲线被压成一条线。
 * Recharts 需要 DOM 测量，SSR 时渲染空容器，水合后补全（图表非 SEO 内容）。
 */
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { fmt } from "@/lib/format";

type Snapshot = { followers: number; recordedAt: string };

const chartConfig = {
  followers: { label: "粉丝量", color: "var(--chart-1)" },
  goal: { label: "目标" },
} satisfies ChartConfig;

export function GrowthChart({
  snapshots,
  goal,
  className,
}: {
  snapshots: Snapshot[];
  goal: number;
  className?: string;
}) {
  const { data, goalY, goalLabel } = useMemo(() => {
    if (snapshots.length === 0) return { data: [], goalY: null as number | null, goalLabel: "" };
    const values = snapshots.map((s) => s.followers);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataSpan = Math.max(dataMax - dataMin, 1);
    const includeGoal = goal > dataMax && goal - dataMax < dataSpan * 2;
    const min = dataMin - dataSpan * 0.1;
    const max = includeGoal ? goal : dataMax + dataSpan * 0.15;
    const span = Math.max(max - min, 1);
    // 目标线固定在图内上沿 8% 处（超出可视范围时仍在图内可见）
    const goalY = includeGoal ? goal : min + span * 0.92;
    const goalLabel = includeGoal ? `目标 ${fmt(goal)}` : `目标 ${fmt(goal)}（远在图外）`;
    return {
      data: snapshots.map((s) => ({ date: s.recordedAt.slice(5, 10), followers: s.followers })),
      goalY,
      goalLabel,
    };
  }, [snapshots, goal]);

  if (data.length === 0) {
    return <p className="text-muted-foreground py-6 text-sm">还没有数据，加入追踪后每天更新。</p>;
  }

  return (
    <ChartContainer config={chartConfig} className={className} style={{ aspectRatio: "800 / 240" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis
            domain={["dataMin - 10%", "dataMax + 15%"]}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => fmt(Math.round(v))}
          />
          <Tooltip
            content={<ChartTooltipContent hideLabel indicator="line" />}
            formatter={(v) => fmt(Number(v))}
          />
          <ReferenceLine
            y={goalY ?? undefined}
            strokeDasharray="4 4"
            stroke="var(--muted-foreground)"
            label={{ value: goalLabel, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Line
            dataKey="followers"
            type="monotone"
            stroke="var(--color-followers)"
            strokeWidth={2}
            dot={data.length <= 30 ? { r: 2.5 } : false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}