import { useState } from "react";
import type { MemberStats, TrackStats } from "@/stats";
import { TRACKS, TRACK_OTHER, trackOf } from "@/tracks";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { AnimatedNumber } from "@/components/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PODIUM } from "@/components/leaderboard/podium";
import { MemberRankRow } from "@/components/leaderboard/MemberRankRow";
import { ArrowUpRight, Blocks, CandlestickChart, Eye, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { fmt, fmtDate, postExcerpt } from "@/lib/format";
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

type SortKey = "followers" | "growth" | "posts";

/**
 * 看板「赛道」区块 = 赛道排行榜：赛道选择器（5 正式 + 综合）+ 三重口径榜单。
 * - 存量粉丝榜：赛道成员按粉丝量排序（原有）
 * - 本周增长榜：赛道成员按近 7 天增长排序
 * - 帖子互动榜：赛道内近 30 天单帖浏览 Top（posts join tracks）
 * 综合是过渡桶不参与榜单；顶部每赛道可直达赛道独立页。
 */
export function TrackSection({ members, trackStats }: { members: MemberStats[]; trackStats: TrackStats[] }) {
  // hooks 必须先于条件 return：赛道成员数从有到无时组件仍会重渲染，晚声明会崩 hooks 顺序
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const [selected, setSelected] = useState<string>(
    () => [...TRACKS, TRACK_OTHER].find((t) => members.some((m) => m.tracks.includes(t.name)))?.name ?? TRACK_OTHER.name
  );
  const active = members.filter((m) => m.tracks.length > 0);
  if (active.length === 0) return null;
  const inTrack = active.filter((m) => m.tracks.includes(selected));
  const isOther = selected === TRACK_OTHER.name;
  const perTrack = trackStats.find((t) => t.name === selected);

  const sortedMembers = [...inTrack].sort((a, b) =>
    sortKey === "growth" ? b.growth7d - a.growth7d : (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0)
  );

  const sorts: Array<{ key: SortKey; label: string }> = [
    { key: "followers", label: "存量粉丝" },
    { key: "growth", label: "本周增长" },
    { key: "posts", label: "帖子互动" },
  ];

  return (
    <div className="mt-6">
      {/* 赛道选择器 */}
      <div className="flex flex-wrap gap-2">
        {[...TRACKS, TRACK_OTHER].map((track) => {
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

      {/* 赛道能量摘要（正式赛道；综合为过渡桶不出数字） */}
      {!isOther && perTrack && perTrack.memberCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-mist">
          <span>
            社群粉丝 <b className="text-ink tabular-nums">{fmt(perTrack.totalFollowers)}</b>
          </span>
          <span>
            近 30 天 <b className="text-signal tabular-nums">+{fmt(perTrack.growth30dTotal)}</b>
          </span>
          <Link
            to="/tracks/$slug"
            params={{ slug: perTrack.slug }}
            className="ml-auto inline-flex items-center gap-1 font-semibold text-signal underline-offset-4 hover:underline"
          >
            赛道主页 <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* 口径切换：存量 / 增长 / 帖子互动（综合过渡桶只出成员） */}
      {!isOther && (
        <SegmentedControl
          value={sortKey}
          onChange={setSortKey}
          options={sorts}
          size="md"
          className="mt-4 flex w-full sm:w-auto"
          ariaLabel="赛道排序口径"
        />
      )}

      {sortKey === "posts" && !isOther ? (
        <TrackPostList trackName={selected} posts={perTrack?.topPosts ?? []} />
      ) : (
        <ol className="mt-5 space-y-2.5">
          {sortedMembers.map((m, i) => (
            <TrackRow key={m.id} member={m} rank={i + 1} podium={PODIUM[i]} metric={sortKey === "growth" ? m.growth7d : null} />
          ))}
          {sortedMembers.length === 0 && <li className="text-sm text-mist">这个赛道还没有成员。</li>}
        </ol>
      )}
    </div>
  );
}

/** 赛道周榜：赛道内近 30 天单帖浏览 Top 3（帖子互动榜） */
function TrackPostList({ trackName, posts }: { trackName: string; posts: TrackStats["topPosts"] }) {
  if (posts.length === 0) {
    return <p className="mt-5 text-sm text-mist">「{trackName}」赛道近期还没有帖子数据，采集跑起来后自动上榜。</p>;
  }
  return (
    <ol className="mt-5 space-y-2.5">
      {posts.map((p, i) => {
        const name = p.member?.displayName ?? p.member?.handle ?? "?";
        return (
          <li key={p.tweetId} className="flex items-center gap-3 rounded-2xl border border-line bg-soft-surface px-4 py-3">
            <div className="w-6 shrink-0 font-extrabold tabular-nums text-mist">{i + 1}</div>
            <Avatar url={p.member?.profileImage ?? null} name={name} className="size-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link to="/members/$id" params={{ id: p.member?.id ?? "" }} className="text-sm font-semibold underline-offset-4 hover:underline">
                  {name}
                </Link>
                <span className="text-xs text-mist tabular-nums">{fmtDate(p.createdAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-mist">{postExcerpt(p.text, 60) ?? "链接帖"}</p>
            </div>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-right text-sm font-bold text-signal tabular-nums"
              title="查看 X 原文"
            >
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" aria-hidden="true" />
                {fmt(p.views ?? (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0))}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** 赛道成员行卡：排名 + 头像 + 名字 + 轨道 chip + 标签 + 粉丝量或周增长（前三名荣誉渐晕） */
function TrackRow({
  member: m,
  rank,
  podium,
  metric,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
  metric: number | null;
}) {
  const name = m.displayName ?? m.handle;
  const track = m.tracks.find((t) => t !== TRACK_OTHER.name) ?? m.tracks[0];
  const trackMeta = track ? trackOf(track) : undefined;
  return (
    <MemberRankRow
      bordered
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
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
              rel="noopener noreferrer"
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
      }
      trailing={
        <div className="shrink-0 text-right">
          {metric !== null ? (
            <>
              <div className="text-lg font-bold text-signal tabular-nums">
                <AnimatedNumber value={metric} prefix="+" />
              </div>
              <div className="text-xs text-mist">近 7 天</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold tabular-nums">
                <AnimatedNumber value={m.latestFollowers ?? 0} />
              </div>
              <div className="text-xs text-mist tabular-nums">
                {m.latestFollowers != null ? `还差 ${fmt(m.nextMilestone - m.latestFollowers)}` : "排队中"}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}