import { cn } from "@/lib/utils";

/**
 * 分段切换控件（pill 组）：全站统一的口径/视图切换器。
 * aria-pressed 让读屏知道每个选项的选中态；sm/md 两档尺寸（高 32 / 36px，触屏可点）。
 * 选项 shrink-0 + nowrap：放进横向滚动容器时不被压扁、不换行。
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
      className={cn("inline-flex gap-1 rounded-full bg-soft-surface p-1", className)}
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
              "shrink-0 cursor-pointer select-none whitespace-nowrap rounded-full font-semibold transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
              active ? "bg-primary text-primary-foreground" : "text-mist hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
