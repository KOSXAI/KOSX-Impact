import type { Influence } from "@/influence";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PARTS: Array<{ key: "scale" | "growth" | "engagement" | "output"; label: string; max: number; hint: string }> = [
  { key: "scale", label: "规模", max: 400, hint: "粉丝量对数映射" },
  { key: "growth", label: "增长", max: 200, hint: "近 30 天相对增长" },
  { key: "engagement", label: "互动", max: 250, hint: "近 30 天互动率中位数" },
  { key: "output", label: "产能", max: 150, hint: "近 30 天发帖数" },
];

/** 影响力指数卡：综合分（0-1000）+ 有效粉丝量 + 四维分项条 */
export function InfluenceCard({ influence }: { influence: Influence | null }) {
  if (!influence) return null;
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-mist">影响力指数</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="bg-gradient-to-br from-gold-text to-gold-deep bg-clip-text text-4xl font-extrabold tabular-nums text-transparent">
                {influence.score}
              </span>
              <span className="text-sm text-mist">/ 1000</span>
            </div>
            <div className="mt-1 text-sm text-mist tabular-nums" title={`质量系数 ×${influence.qualityMultiplier.toFixed(2)}`}>
              有效粉丝 <b className="text-ink">{fmt(influence.effectiveFollowers)}</b>
            </div>
          </div>
          <div className="rounded-2xl bg-soft-surface px-4 py-3 text-right">
            <div className="text-xs text-mist">互动率中位数</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums">
              {influence.engagementMedian != null
                ? `${Math.round(influence.engagementMedian * 10000) / 100}%`
                : "—"}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {PARTS.map(({ key, label, max, hint }) => {
            const v = influence.breakdown[key];
            return (
              <div key={label} title={`${hint}（满分 ${max}）`}>
                <div className="flex justify-between text-sm">
                  <span className="text-mist">{label}</span>
                  <span className="tabular-nums">{v}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                  <div
                    className={cn("h-full rounded-full", label === "互动" ? "bg-signal" : "bg-gold/80")}
                    style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {!influence.hasPostData && (
          <p className="mt-4 text-xs text-mist">帖子数据采集完成后，互动与产能维度自动计入。</p>
        )}
      </CardContent>
    </Card>
  );
}