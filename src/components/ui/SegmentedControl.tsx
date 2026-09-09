import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 分段切换控件（pill 组）：全站统一的口径/视图切换器。
 * aria-pressed 让读屏知道每个选项的选中态；sm/md 两档尺寸。
 */
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ key: T; label: string }>;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex gap-1 rounded-full border border-line bg-soft-surface p-1", className)}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={String(o.key)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "cursor-pointer select-none rounded-full font-semibold transition-colors",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm",
              active ? "bg-white text-paper" : "text-mist hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
