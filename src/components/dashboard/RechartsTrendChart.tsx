/**
 * Recharts 社群总粉丝趋势（独立 chunk，仅客户端加载）：
 * daily_stats 按日合计的面积图，信号色渐变填充。
 */
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { fmt } from "@/lib/format";
import type { TrendPoint } from "@/stats";

const chartConfig = {
  total: { label: "社群粉丝", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function RechartsTrendChart({ data }: { data: TrendPoint[] }) {
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
