import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion";

/**
 * 全站统一统计卡：label + 大数字（数字走 AnimatedNumber 动效）。
 * highlight 打信号色边框 + 光晕；badge 挂右上角小徽标；prefix/suffix/hint 拼在数值前后。
 * value 传字符串时（如「数据采集中」）原样展示，不做数字动效。
 */
export function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  hint,
  highlight = false,
  badge,
}: {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={cn(
        "card-lift relative overflow-hidden rounded-2xl border bg-surface p-4",
        highlight ? "border-signal/30" : "border-line"
      )}
    >
      {highlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-signal/15 blur-xl"
        />
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-mist sm:text-sm">{label}</span>
        {badge && (
          <span className="rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-bold text-signal">
            {badge}
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-2 block text-2xl font-bold tracking-tight tabular-nums sm:text-3xl",
          highlight ? "font-extrabold text-signal" : "text-ink"
        )}
      >
        {typeof value === "number" ? (
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
        ) : (
          `${prefix}${value}${suffix}`
        )}
        {hint && <span className="ml-1.5 text-sm font-semibold text-signal">{hint}</span>}
      </div>
    </div>
  );
}
