/**
 * Recharts 社群趋势实现（独立 chunk，仅客户端加载）。
 * - 总量模式：daily_stats 快照推导的社群总粉丝面积图，信号色渐变填充
 * - 日增模式：相邻两日总量之差的柱状图（集体爆发一眼可见）
 */
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { fmt } from "@/lib/format";
import type { TrendPoint } from "@/stats";
import type { TrendMode } from "./TrendChart";

const chartConfig = {
  total: { label: "社群粉丝", color: "var(--chart-1)" },
  delta: { label: "社群日增", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function RechartsTrendChart({ data, mode }: { data: TrendPoint[]; mode: TrendMode }) {
  const daily = useMemo(() => {
    const points = data.slice(1).map((d, i) => ({
      label: d.date.slice(5),
      delta: d.total - data[i].total,
    }));
    const values = points.map((p) => p.delta);
    const dMin = Math.min(0, ...values);
    const dMax = Math.max(...values, 1);
    const span = dMax - dMin;
    return {
      points,
      // 柱状图基线固定在 0；有负增长日时把负向也纳入坐标范围
      domain: [dMin === 0 ? 0 : dMin - span * 0.15, dMax + span * 0.15] as [number, number],
    };
  }, [data]);

  if (mode === "daily") {
    return (
      <ChartContainer config={chartConfig} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily.points} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis
              domain={daily.domain}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => fmt(Math.round(v))}
            />
            <Tooltip
              content={<ChartTooltipContent hideLabel />}
              formatter={(v) => (Number(v) > 0 ? `+${fmt(Number(v))}` : fmt(Number(v)))}
            />
            <Bar dataKey="delta" fill="var(--color-delta)" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  }

  const points = data.map((d) => ({ ...d, label: d.date.slice(5) }));
  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis
            domain={["dataMin - 10%", "dataMax + 12%"]}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => fmt(Math.round(v))}
          />
          <Tooltip content={<ChartTooltipContent hideLabel />} formatter={(v) => fmt(Number(v))} />
          <Area
            dataKey="total"
            type="monotone"
            stroke="var(--color-total)"
            strokeWidth={2}
            fill="url(#trendFill)"
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
