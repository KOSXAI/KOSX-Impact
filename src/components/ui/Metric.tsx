import type { ReactNode } from "react";
import { fmt } from "@/lib/format";

/** 行内小指标：图标 + 数值；sr-only label 让读屏念出「浏览 1.2万」而不只是数字 */
export function Metric({ icon, value, label }: { icon: ReactNode; value: number | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-mist" title={label}>
      {icon}
      <span className="tabular-nums">{value != null ? fmt(value) : "—"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
