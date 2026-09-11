import { Link } from "@tanstack/react-router";
import { fmt } from "@/lib/format";
import type { TrackStats } from "@/stats";

/**
 * 赛道能量条：五条赛道按 30 天净增 ÷ 粉丝基数的「涨速」降序，一眼看清哪条赛道在涨。
 * 数据源 trackStats（真实增长口径，非成员分组）。整行点击进博主库对应赛道。
 */
export function TrackEnergyBar({ tracks }: { tracks: TrackStats[] }) {
  const rows = tracks
    .filter((t) => t.memberCount > 0 && t.name !== "综合")
    .map((t) => ({
      ...t,
      rate: t.totalFollowers > 0 ? t.growth30dTotal / t.totalFollowers : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  if (rows.length === 0) return null;
  const maxRate = Math.max(...rows.map((r) => r.rate), 1e-6);

  return (
    <div>
      <h3 className="text-sm font-semibold text-mist">赛道能量</h3>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.name}>
            <Link
              to="/members"
              search={{ view: "track", track: r.name }}
              className="group flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40"
            >
              <span className="flex w-24 shrink-0 flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold">{r.name}</span>
                <span className="text-xs text-mist tabular-nums">{r.memberCount} 人</span>
              </span>
              <span className="relative h-2 min-w-0 flex-1">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-signal"
                  style={{ width: `${Math.max((r.rate / maxRate) * 100, 4)}%`, opacity: 1 - i * 0.12 }}
                />
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold text-signal tabular-nums">+{fmt(r.growth30dTotal)}</span>
                <span className="block text-[11px] text-mist tabular-nums" title={`粉丝基数 ${fmt(r.totalFollowers)}`}>
                  {r.totalFollowers > 0 ? `30 天 +${(r.rate * 100).toFixed(1)}%` : "—"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
