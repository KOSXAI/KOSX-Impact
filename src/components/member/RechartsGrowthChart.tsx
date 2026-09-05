/**
 * Recharts 成长曲线实现（独立 chunk，仅客户端加载）。
 * 取值逻辑与旧版内联 SVG 一致：目标线离数据 >2 倍跨度时不进坐标范围，
 * 以图内上沿虚线标注替代，避免曲线被压平。
 */
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { fmt, badge } from "@/lib/format";
import { titleOf } from "@/milestones";
import { useMediaQuery } from "@/lib/use-media-query";

type Snapshot = { followers: number; recordedAt: string };

const chartConfig = {
  followers: { label: "粉丝量", color: "var(--chart-1)" },
  nextMilestone: { label: "下一称号" },
} satisfies ChartConfig;

export default function RechartsGrowthChart({
  snapshots,
  nextMilestone,
}: {
  snapshots: Snapshot[];
  nextMilestone: number;
}) {
  // 移动端压缩 Y 轴：宽度收窄 + 紧凑刻度，把绘图区让给曲线
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const { data, goalY, goalLabel } = useMemo(() => {
    if (snapshots.length === 0) return { data: [], goalY: null as number | null, goalLabel: "" };
    const values = snapshots.map((s) => s.followers);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataSpan = Math.max(dataMax - dataMin, 1);
    const includeGoal = nextMilestone > dataMax && nextMilestone - dataMax < dataSpan * 2;
    const min = dataMin - dataSpan * 0.1;
    const max = includeGoal ? nextMilestone : dataMax + dataSpan * 0.15;
    const span = Math.max(max - min, 1);
    // 目标线固定在图内上沿 8% 处（超出可视范围时仍在图内可见）
    const goalY = includeGoal ? nextMilestone : min + span * 0.92;
    const goalLabel = `下一称号「${titleOf(nextMilestone)}」`;
    return {
      data: snapshots.map((s) => ({ date: s.recordedAt.slice(5, 10), followers: s.followers })),
      goalY,
      goalLabel,
    };
  }, [snapshots, nextMilestone]);

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--line)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis
            domain={["dataMin - 10%", "dataMax + 15%"]}
            tickLine={false}
            axisLine={false}
            width={isDesktop ? 56 : 40}
            tickFormatter={(v: number) => (isDesktop ? fmt(Math.round(v)) : badge(Math.round(v)))}
          />
          <Tooltip
            content={<ChartTooltipContent hideLabel indicator="line" />}
            formatter={(v) => fmt(Number(v))}
          />
          <ReferenceLine
            y={goalY ?? undefined}
            strokeDasharray="4 4"
            stroke="var(--muted-foreground)"
            label={{ value: goalLabel, position: "insideTopRight", fontSize: 12, fill: "var(--muted-foreground)" }}
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