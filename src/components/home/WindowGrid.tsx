import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { VIEW_PRESETS, type LibrarySearch, type ViewKey, type MetricCtx, type MetricValue } from "@/components/library/presets";
import { fmt, postExcerpt } from "@/lib/format";
import { groupClimbs, titleOf } from "@/milestones";
import type { DashboardStats, MemberStats, PostItem, TrackStats } from "@/stats";

/**
 * 榜单窗格墙：成员榜单（tab 切换七个视图）+ 赛道分组 + 登阶记录 + 内容热点 + 社群话题。
 * 每窗格现算真实 Top5 行；名次环比只在总排行显示；点击进完整榜。
 */

const LIB_CTX: MetricCtx = { growthMetric: "growth", growthRange: 7, trackSort: "followers" };

/** 九视图的完整榜落点（成长视图带默认口径，进详情即所见即所得） */
const VIEW_LINK: Record<ViewKey, LibrarySearch> = {
  total: { view: "total" },
  growth: { view: "growth", metric: "growth", range: 7 },
  rising: { view: "rising" },
  influence: { view: "influence" },
  mentions: { view: "mentions" },
  active: { view: "active" },
  new: { view: "new" },
  track: { view: "track" },
  climbs: { view: "climbs" },
};

const VIEW_ORDER: ViewKey[] = [
  "total",
  "growth",
  "rising",
  "influence",
  "mentions",
  "active",
  "new",
  "track",
  "climbs",
];

/** 名次环比箭头（总排行专用，正=昨日到今日名次上升） */
function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return null;
  if (delta > 0) {
    return <span className="shrink-0 text-[11px] font-bold text-delta-up tabular-nums">↑{delta}</span>;
  }
  return <span className="shrink-0 text-[11px] font-bold text-delta-down tabular-nums">↓{Math.abs(delta)}</span>;
}

function WindowShell({ title, hint, to, search, children }: {
  title: string;
  hint?: string;
  to: string;
  search?: LibrarySearch;
  children: ReactNode;
}) {
  return (
    <section className="panel-card flex flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-mist" title={hint}>
          {title}
        </h3>
        <Link to={to} search={search} className="shrink-0 text-xs font-semibold text-signal underline-offset-4 hover:underline">
          完整榜 ›
        </Link>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-start gap-2">{children}</div>
    </section>
  );
}

function MemberRow({ rank, m, metric, delta }: {
  rank: number;
  m: MemberStats;
  metric: MetricValue | null;
  delta?: number | null;
}) {
  const name = m.displayName ?? m.handle;
  return (
    <Link
      to="/members/$id"
      params={{ id: m.id }}
      className="flex items-center gap-2 min-h-10 flex-1 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
    >
      <span className="w-4 shrink-0 text-right text-xs text-mist tabular-nums">{rank}</span>
      <Avatar url={m.profileImage} name={name} className="size-6 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {metric?.tone !== "signal" && delta != null && delta !== 0 && <RankDelta delta={delta} />}
      {metric && (
        <span className="shrink-0 text-right">
          <span className={metric.tone === "signal" ? "text-sm font-bold text-signal tabular-nums" : "text-sm font-bold tabular-nums"}>
            {metric.value}
          </span>
        </span>
      )}
    </Link>
  );
}

function PostRow({ p }: { p: PostItem }) {
  const value = (p.viewsGain ?? 0) > 0 && p.views != null ? `${fmt(p.views)} · +${fmt(p.viewsGain!)}` : p.views != null ? fmt(p.views) : `${fmt(p.likes ?? 0)} 赞`;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 min-h-10 flex-1 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
    >
      {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-6 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-xs text-mist">{postExcerpt(p.text) ?? "链接帖"}</span>
      <span className="shrink-0 text-xs font-bold text-mist tabular-nums">{value}</span>
    </a>
  );
}

export function WindowGrid({ stats }: { stats: DashboardStats }) {
  // 七个成员视图啪入一个窗格，tab 切换（同口径现算：复用 VIEW_PRESETS 的过滤/排序/主指标）
  const [activeView, setActiveView] = useState<ViewKey>("total");
  const memberViews = VIEW_ORDER.filter((k) => k !== "track" && k !== "climbs").map((k) => {
    const preset = VIEW_PRESETS[k];
    const rows = [...stats.members]
      .filter((m) => (preset.filter ? preset.filter(m) : true))
      .sort(preset.sort ? (a, b) => preset.sort!(a, b, LIB_CTX) : () => 0)
      .slice(0, 5);
    return { key: k, preset, rows };
  });
  const active = memberViews.find((v) => v.key === activeView) ?? memberViews[0];

  // 赛道分组窗格：按粉丝规模降序的赛道 chips
  const trackChips = stats.trackStats
    .filter((t) => t.memberCount > 0 && t.name !== "综合")
    .sort((a, b) => b.totalFollowers - a.totalFollowers);

  // 登阶记录窗格：最近登阶事件流（同人多篇合并）
  const climbGroups = groupClimbs(stats.recentMilestones).slice(0, 5);
  const memberById = new Map(stats.members.map((m) => [m.id, m]));

  // 内容热点窗格：今日爆帖优先（正在发生），无增量数据回退累计浏览
  const hotPosts = (stats.trendingPosts?.length ? stats.trendingPosts : stats.topPosts).slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* 成员榜单：tab 切换七个视图 */}
      <WindowShell title="成员榜单" to="/members" search={VIEW_LINK[active.key]} hint="七个榜单视角，切到哪个看哪个">
      <div className="flex flex-wrap gap-1.5">
          {memberViews.map(({ key, preset }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveView(key)}
              aria-pressed={key === active.key}
              className={key === active.key ? "rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground" : "rounded-full bg-soft-surface px-2.5 py-1 text-xs font-semibold text-mist transition-colors hover:text-ink"}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex min-h-48 flex-1 flex-col justify-start gap-2">
          {active.rows.length > 0 ? (
            active.rows.map((m, i) => (
              <MemberRow
                key={m.id}
                rank={i + 1}
                m={m}
                metric={active.preset.metric(m, LIB_CTX)}
                delta={active.key === "total" ? (m.rankDelta ?? null) : null}
              />
            ))
          ) : (
            <p className="px-2 py-3 text-xs text-mist">{active.preset.empty}</p>
          )}
        </div>
      </WindowShell>

      {/* 赛道分组窗格 */}
      <WindowShell title="赛道分组" to="/members" search={{ view: "track" }}>
        {trackChips.length > 0 ? (
          trackChips.map((t: (typeof trackChips)[number]) => (
            <Link
              key={t.name}
              to="/members"
              search={{ view: "track", track: t.name }}
              className="flex items-center gap-2 min-h-10 flex-1 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
            >
              <span className="text-sm font-semibold">{t.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-mist tabular-nums">{t.memberCount} 人</span>
              <span className="shrink-0 text-xs font-bold text-mist tabular-nums">{fmt(t.totalFollowers)}</span>
              <span className="shrink-0 text-xs font-bold text-signal tabular-nums">+{fmt(t.growth30dTotal)}</span>
            </Link>
          ))
        ) : (
          <p className="px-2 py-3 text-xs text-mist">{VIEW_PRESETS.track.empty}</p>
        )}
      </WindowShell>

      {/* 登阶记录窗格 */}
      <WindowShell title="登阶记录" to="/members" search={{ view: "climbs" }}>
        {climbGroups.length > 0 ? (
          climbGroups.map((g) => (
            <Link
              key={g.key}
              to="/members/$id"
              params={{ id: g.memberId }}
              className="flex items-center gap-2 min-h-10 flex-1 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
            >
              <Avatar url={memberById.get(g.memberId)?.profileImage} name={g.items[0].displayName ?? g.items[0].handle} className="size-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{g.items[0].displayName ?? g.items[0].handle}</span>
              <span className="shrink-0 truncate text-xs font-bold text-gold-text">「{titleOf(g.items[0].threshold)}」</span>
            </Link>
          ))
        ) : (
          <p className="px-2 py-3 text-xs text-mist">{VIEW_PRESETS.climbs.empty}</p>
        )}
      </WindowShell>

      {/* 内容热点窗格 */}
      <WindowShell title="内容热点" to="/posts">
        {hotPosts.length > 0 ? (
          hotPosts.map((p) => <PostRow key={p.tweetId} p={p} />)
        ) : (
          <p className="px-2 py-3 text-xs text-mist">帖子数据采集中，热点马上就来。</p>
        )}
      </WindowShell>

      {/* 社群话题窗格 */}
      <WindowShell title="社群话题" to="/members" hint="成员聚合的话题标签，点进看谁在做这件事">
        {(stats.topicStats ?? []).length > 0 ? (
          (stats.topicStats ?? []).slice(0, 8).map((t) => (
            <Link
              key={t.tag}
              to="/members"
              search={{ tag: t.tag }}
              className="flex items-center gap-2 min-h-10 flex-1 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
            >
              <span className="shrink-0 text-sm font-semibold text-ink">{t.tag}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-mist tabular-nums">{t.memberCount} 人在做</span>
              <span className="shrink-0 text-right text-xs tabular-nums">
                <span className="block font-bold text-mist">{fmt(t.views30d)}</span>
                <span className="block text-signal">+{fmt(t.growth30d)}</span>
              </span>
            </Link>
          ))
        ) : (
          <p className="px-2 py-3 text-xs text-mist">话题标签还在积累，先去博主库逛逛。</p>
        )}
      </WindowShell>
    </div>
  );
}
