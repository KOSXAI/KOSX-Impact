import type { MemberStats } from "@/stats";
import { TRACKS, TRACK_OTHER, trackOf } from "@/tracks";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 赛道图标映射（src/tracks.ts 存的是图标名字符串，组件侧映射到 lucide 组件） */
const TRACK_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

function TrackIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TRACK_ICONS[name] ?? Shapes;
  return <Icon className={className} aria-hidden="true" />;
}

/** 看板「赛道」区块：5 赛道 + 综合兜底，显示各赛道人数，点赛道看该赛道成员榜 */
export function TrackSection({ members }: { members: MemberStats[] }) {
  const active = members.filter((m) => m.tracks.length > 0);
  if (active.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="text-sm font-semibold text-mist">赛道</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...TRACKS, TRACK_OTHER].map((track) => {
          const inTrack = active.filter((m) => m.tracks.includes(track.name));
          if (inTrack.length === 0) return null;
          return (
            <TrackCard key={track.slug} name={track.name} icon={track.icon} members={inTrack} />
          );
        })}
      </div>
    </div>
  );
}

/** 单个赛道卡：图标 + 赛道名 + 人数 + 该赛道 Top 成员头像行 */
function TrackCard({
  name,
  icon,
  members,
}: {
  name: string;
  icon: string;
  members: MemberStats[];
}) {
  // 综合是过渡桶，不参与排名，只显示人数
  const isOther = name === TRACK_OTHER.name;
  const sorted = [...members].sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));
  const top = sorted.slice(0, 4);
  const track = trackOf(name);
  return (
    <div className="rounded-2xl border border-line bg-soft-surface px-3.5 py-3 transition-colors hover:border-signal/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrackIcon
            name={icon}
            className={cn("size-4 shrink-0", name === "AI工具" ? "text-signal" : "text-mist")}
          />
          <span className="truncate text-sm font-semibold">{name}</span>
        </div>
        <span className="shrink-0 text-xs text-mist tabular-nums">{members.length} 人</span>
      </div>
      {!isOther && top.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex -space-x-2">
            {top.map((m) => (
              <Link
                key={m.id}
                to="/members/$id"
                params={{ id: m.id }}
                title={m.displayName ?? m.handle}
                className="ring-soft-surface rounded-full ring-2 transition-transform hover:z-10 hover:-translate-y-0.5"
              >
                <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-6" />
              </Link>
            ))}
          </div>
          <span className="ml-1 truncate text-xs text-mist">
            {sorted[0] ? (sorted[0].displayName ?? sorted[0].handle) : ""}
            {sorted[0] && (sorted[0].latestFollowers ?? 0) > 0 && (
              <span className="tabular-nums"> · {fmt(sorted[0].latestFollowers ?? 0)}</span>
            )}
          </span>
        </div>
      )}
      {track && (
        <span className="sr-only">{track.description}</span>
      )}
    </div>
  );
}
