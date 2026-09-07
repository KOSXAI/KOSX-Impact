import { useState } from "react";
import type { MemberStats } from "@/stats";
import { TRACKS, TRACK_OTHER, trackOf } from "@/tracks";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { AnimatedNumber } from "@/components/motion";
import { Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 赛道图标映射（src/tracks.ts 存图标名字符串，组件侧映射到 lucide 组件） */
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

/**
 * 看板「赛道」区块 = 赛道排行榜：顶部赛道选择（5 正式 + 综合），
 * 选中赛道后显示该赛道成员按粉丝量排序的榜单。一人可挂多赛道，按归属分别上榜。
 */
export function TrackSection({ members }: { members: MemberStats[] }) {
  const active = members.filter((m) => m.tracks.length > 0);
  if (active.length === 0) return null;

  const allTracks = [...TRACKS, TRACK_OTHER];
  // 默认选第一个有人的正式赛道
  const [selected, setSelected] = useState<string>(
    () => allTracks.find((t) => active.some((m) => m.tracks.includes(t.name)))?.name ?? TRACK_OTHER.name
  );
  const inTrack = active.filter((m) => m.tracks.includes(selected));

  return (
    <div className="mt-6">
      {/* 赛道选择器 */}
      <div className="flex flex-wrap gap-2">
        {allTracks.map((track) => {
          const count = active.filter((m) => m.tracks.includes(track.name)).length;
          if (count === 0) return null;
          return (
            <button
              key={track.slug}
              onClick={() => setSelected(track.name)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                selected === track.name
                  ? "border-signal/40 bg-signal/10 text-signal"
                  : "border-line bg-soft-surface text-mist hover:border-signal/40 hover:text-ink"
              )}
            >
              <TrackIcon name={track.icon} className="size-3.5" aria-hidden="true" />
              {track.name}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 选中赛道成员榜（按粉丝量从高到低） */}
      <ol className="mt-5 space-y-2.5">
        {inTrack
          .sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0))
          .map((m, i) => (
            <TrackRow key={m.id} member={m} rank={i + 1} />
          ))}
      </ol>
    </div>
  );
}

/** 赛道榜行卡：排名 + 头像 + 名字 + 粉丝量 + 距下一称号（仿总排行行，精简） */
function TrackRow({ member: m, rank }: { member: MemberStats; rank: number }) {
  const name = m.displayName ?? m.handle;
  const track = m.tracks.find((t) => t !== TRACK_OTHER.name) ?? m.tracks[0];
  const trackMeta = track ? trackOf(track) : undefined;
  const isPodium = rank <= 3;
  const P = [
    { rankNum: "from-amber-300 to-amber-600", ring: "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent" },
    { rankNum: "from-slate-300 to-slate-500", ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent" },
    { rankNum: "from-orange-400 to-orange-700", ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent" },
  ];
  const podium = isPodium ? P[rank - 1] : undefined;
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        podium ? `card-lift rounded-2xl border ${podium.ring}` : "rounded-2xl border border-line bg-soft-surface"
      )}
    >
      <div
        className={cn(
          "w-6 shrink-0 font-extrabold tabular-nums",
          podium ? "bg-gradient-to-br bg-clip-text text-transparent" : "text-mist",
          podium?.rankNum
        )}
      >
        {rank}
      </div>
      <Avatar url={m.profileImage} name={name} className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
            {name}
          </Link>
          {trackMeta && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-mist"
              title={trackMeta.description}
            >
              <TrackIcon name={trackMeta.icon} className="size-3" aria-hidden="true" />
              {trackMeta.name}
            </span>
          )}
          <a
            href={`https://x.com/${encodeURIComponent(m.handle)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
          >
            @{m.handle}
          </a>
        </div>
        {m.tags.length > 0 && (
          <div className="mt-1 truncate text-xs text-mist">
            {m.tags.slice(0, 4).map((t) => `#${t}`).join("  ")}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums">
          <AnimatedNumber value={m.latestFollowers ?? 0} />
        </div>
        <div className="text-xs text-mist tabular-nums">
          {m.latestFollowers != null ? `还差 ${fmt(m.nextMilestone - m.latestFollowers)}` : "排队中"}
        </div>
      </div>
    </li>
  );
}
