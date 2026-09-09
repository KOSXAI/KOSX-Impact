import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { MemberStats, TrackStats } from "@/stats";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { NotFound } from "@/components/NotFound";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/member/Avatar";
import { TitleBadge } from "@/components/member/TitleBadge";
import { PODIUM } from "@/components/leaderboard/podium";
import { MemberRankRow } from "@/components/leaderboard/MemberRankRow";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Blocks, CandlestickChart, Check, Copy, Eye, Globe, PenTool, Shapes, Share2, Sparkles, type LucideIcon } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TRACK_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

export const Route = createFileRoute("/_shell/_creators/tracks/$slug")({
  loader: async ({ params }) => {
    const stats = await fetchDashboard();
    const track = [...TRACKS, TRACK_OTHER].find((t) => t.slug === params.slug);
    // 未知 slug 直接 404（此前返回 200 + 「赛道不存在」，软 404 会被搜索引擎收录）
    if (!track) throw notFound();
    const trackStat: TrackStats | undefined = stats.trackStats.find((t) => t.slug === params.slug);
    if (!trackStat) throw notFound();
    const members = stats.members.filter((m) => m.tracks.includes(track.name));
    // 赛道内话题标签（去重排序，按出现次数）
    const tagCounts = new Map<string, number>();
    for (const m of members) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
    return { track, trackStat, members, tags };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.track ?? null;
    const stat = loaderData?.trackStat;
    const title = t ? `${t.name} 赛道｜${SITE_NAME}` : "赛道不存在";
    const desc = t
      ? `「${t.name}」赛道 ${stat?.memberCount ?? 0} 位博主，社群粉丝 ${fmt(stat?.totalFollowers ?? 0)}。${t.description}`
      : "赛道不存在";
    return {
      meta: t
        ? [
            { title },
            { name: "description", content: desc },
            { property: "og:title", content: title },
            { property: "og:description", content: desc },
            { property: "og:type", content: "website" },
            { property: "og:url", content: `${SITE_URL}/tracks/${t.slug}` },
            { property: "og:image", content: `${SITE_URL}/og/tracks/${t.slug}.png?v=1` },
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:image", content: `${SITE_URL}/og/tracks/${t.slug}.png?v=1` },
          ]
        : [{ title }, { name: "robots", content: "noindex, follow" }],
      ...(t ? { links: [{ rel: "canonical", href: `${SITE_URL}/tracks/${t.slug}` }] } : {}),
    };
  },
  component: TrackPage,
  notFoundComponent: () => <NotFound title="这个赛道不存在" description="去赛道总览看看全部赛道。" />,
});

function TrackPage() {
  const { track, trackStat, members, tags } = Route.useLoaderData();
  const [copiedHandles, setCopiedHandles] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const Icon = TRACK_ICONS[track.icon] ?? Shapes;
  const isOther = track.slug === TRACK_OTHER.slug;
  const sorted = [...members].sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));

  const copyAllHandles = async () => {    const text = sorted.map((m) => `@${m.handle}`).join(" ");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHandles(true);
      setTimeout(() => setCopiedHandles(false), 2000);
    } catch {
      /* 剪贴板不可用时静默失败（桌面端受限环境） */
    }
  };

  const shareText = `我在 KOSX 万粉影响力计划围观「${track.name}」赛道：${trackStat.memberCount} 位博主、社群粉丝 ${fmt(trackStat.totalFollowers)}，这个领域的好内容都在这里 🔥 ${SITE_URL}/tracks/${track.slug}`;
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      /* 同上 */
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <div className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-soft-surface">
              <Icon className="size-6 text-signal" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{track.name} 赛道</h1>
              <p className="mt-1.5 text-sm text-mist sm:text-base">{track.description}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={copyAllHandles}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold transition-colors hover:border-signal/40 hover:text-ink"
                title="一键复制赛道全部 @ 清单，到 X 批量关注"
              >
                {copiedHandles ? <Check className="size-4 text-signal" /> : <Copy className="size-4" />}
                {copiedHandles ? "已复制" : "复制全部 @"}
              </button>
              <button
                onClick={copyShare}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
                title="复制分享文案，带上赛道页链接"
              >
                {copiedShare ? <Check className="size-4" /> : <Share2 className="size-4" />}
                {copiedShare ? "已复制" : "分享赛道"}
              </button>
            </div>
          </div>
        </Reveal>

        {/* 赛道能量卡（综合为过渡桶，只出人数） */}
        <Reveal delay={0.06}>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <EnergyCard label="赛道成员" value={trackStat.memberCount} />
            {!isOther && <EnergyCard label="社群粉丝" value={trackStat.totalFollowers} />}
            {!isOther && <EnergyCard label="近 30 天新增" value={trackStat.growth30dTotal} prefix="+" />}
            {!isOther && <EnergyCard label="近 30 天内容" value={trackStat.topPosts.length ? `${trackStat.topPosts.length} 帖上榜` : "数据采集中"} />}
          </div>
        </Reveal>

        {/* 赛道成员榜（按粉丝量，前三名荣誉样式） */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">成员榜</h2>
            {sorted.length === 0 ? (
              <p className="mt-4 text-mist">这个赛道还没有成员上榜。</p>
            ) : (
              <RevealGroup className="mt-5 space-y-3">
                {sorted.map((m, i) => (
                  <RevealItem key={m.id} y={12}>
                    <TrackMemberRow member={m} rank={i + 1} podium={PODIUM[i]} />
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </section>
        </Reveal>

        {/* 赛道互动 Top：近 30 天单帖浏览（帖子数据跑起来后出现） */}
        {!isOther && trackStat.topPosts.length > 0 && (
          <Reveal delay={0.08}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">单帖互动 Top</h2>
              <ol className="mt-5 space-y-2.5">
                {trackStat.topPosts.map((p, i) => {
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
                        <p className="mt-0.5 line-clamp-1 text-xs text-mist">{p.text ?? "（无正文）"}</p>
                      </div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-right text-sm font-bold text-signal tabular-nums" title="查看 X 原文">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" aria-hidden="true" />
                          {fmt(p.views ?? (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0))}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </section>
          </Reveal>
        )}

        {/* 赛道话题标签 */}
        {tags.length > 0 && (
          <Reveal delay={0.08}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">话题标签</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.slice(0, 12).map(({ tag, count }) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist"
                    title={`${count} 位赛道成员打上此标签`}
                  >
                    #{tag}
                    <b className="text-ink tabular-nums">{count}</b>
                  </span>
                ))}
              </div>
            </section>
          </Reveal>
        )}
    </div>
  );
}

function EnergyCard({ label, value, prefix = "" }: { label: string; value: number | string; prefix?: string }) {
  return <StatCard label={label} value={value} prefix={prefix} />;
}

/** 赛道成员行：排名 + 头像 + 名字 + 称号 + 标签 + 粉丝量（前三名渐晕） */
function TrackMemberRow({
  member: m,
  rank,
  podium,
}: {
  member: MemberStats;
  rank: number;
  podium?: (typeof PODIUM)[number];
}) {
  const name = m.displayName ?? m.handle;
  return (
    <MemberRankRow
      bordered
      rank={rank}
      podium={podium}
      profileImage={m.profileImage}
      name={name}
      middle={
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to="/members/$id" params={{ id: m.id }} className="font-semibold underline-offset-4 hover:underline">
              {name}
            </Link>
            <TitleBadge threshold={m.prevMilestone} />
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
          <div className="text-lg font-bold tabular-nums">{fmt(m.latestFollowers ?? 0)}</div>
          <div className="text-xs text-mist tabular-nums">
            {m.latestFollowers != null ? `还差 ${fmt(m.nextMilestone - m.latestFollowers)}` : "排队中"}
          </div>
        </div>
      }
    />
  );
}