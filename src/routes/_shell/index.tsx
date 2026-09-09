import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { DashboardStats, MemberStats } from "@/stats";
import { StatCard } from "@/components/ui/StatCard";
import { GrowProgress, PopIn, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { MentionsSection } from "@/components/dashboard/MentionsSection";
import { MILESTONES, TITLE_FILL, titleOf } from "@/milestones";
import { TRACKS } from "@/tracks";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmt, postExcerpt } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: SITE_NAME },
      { name: "description", content: `${SITE_NAME}：追踪每一位成员冲刺一个个称号大关的过程，看见每个人的成长，也看见整个社群正在产生多大的影响。` },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = Route.useLoaderData();
  const latest = stats.recentMilestones[0];
  const justAchieved = latest && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  const totalClimbs = stats.members.reduce((sum, m) => sum + m.climbs, 0);

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
        </Reveal>

        {/* 数据卡：社群的四个侧面 */}
        <RevealGroup className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
          <RevealItem>
            <StatCard label="社群粉丝" value={stats.totalFollowers} />
          </RevealItem>
          <RevealItem>
            <StatCard label="近 30 天新增" value={stats.totalGrowth30d} prefix="+" highlight badge="30D" />
          </RevealItem>
          <RevealItem>
            <StatCard label="万粉成员" value={stats.tenKMembers} />
          </RevealItem>
          <RevealItem>
            <StatCard label="追踪成员" value={stats.members.length} />
          </RevealItem>
        </RevealGroup>

        {/* 今日动态 / 赛道速览 / 内容热点：一屏的三个「现在」 */}
        <Reveal delay={0.06}>
          <TodayOverview stats={stats} />
        </Reveal>

        {/* 社群全景：称号分布（悬浮/点按看明细）+ 冲线在即 + 总量趋势（数据点满 2 天自动出现折线） */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">社群全景</h2>
              {totalClimbs > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-white/20 hover:text-ink" tabIndex={0}>
                      🏅 已领 <b className="text-ink tabular-nums">{totalClimbs}</b> 枚称号
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    全社群成员跨越各粉丝阶梯里程碑累计解锁的成就称号总数
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <TitleDistribution members={stats.members} />
            <NextGateRace members={stats.members} />
            {stats.trend.length >= 2 && (
              <div className="mt-6 border-t border-line pt-6">
                <TrendChart data={stats.trend} />
              </div>
            )}
            {/* 社群互推：近 30 天帖子正文相互 @ 的关系边（影响力网络的第一块真实数据） */}
            {stats.mutualEdges && stats.mutualEdges.length > 0 && (
              <div className="mt-6 border-t border-line pt-6">
                <h3 className="text-sm font-semibold text-mist">社群互推</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {stats.mutualEdges.slice(0, 10).map((e) => {
                    const from = stats.members.find((m) => m.id === e.from);
                    const to = stats.members.find((m) => m.id === e.to);
                    if (!from || !to) return null;
                    return (
                      <span
                        key={`${e.from}-${e.to}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist tabular-nums"
                        title={`${from.handle} 在近 30 天提到 ${to.handle} ${e.count} 次`}
                      >
                        <span className="font-semibold text-ink">{from.displayName ?? from.handle}</span>
                        <span aria-hidden="true">→</span>
                        <span className="font-semibold text-ink">{to.displayName ?? to.handle}</span>
                        <b className="text-signal">×{e.count}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </Reveal>

        {justAchieved && (
          <PopIn className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-signal/20 bg-signal/8 px-5 py-4">
            <span>🎉 恭喜</span>
            <Link to="/members/$id" params={{ id: latest.memberId }} className="font-semibold underline-offset-4 hover:underline">
              {latest.displayName ?? latest.handle}
            </Link>
            <span>拿下称号「{titleOf(latest.threshold)}」</span>
          </PopIn>
        )}

        {/* 品牌声量：站外对 KOSX 的提及 */}
        {stats.mentions.length > 0 && (
          <Reveal delay={0.08}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">品牌声量</h2>
              {(() => {
                const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
                for (const mn of stats.mentions) if (mn.sentiment && counts[mn.sentiment] != null) counts[mn.sentiment]++;
                const labels: Record<string, string> = { positive: "正面", neutral: "中性", negative: "负面" };
                const dot: Record<string, string> = { positive: "bg-emerald-500", neutral: "bg-slate-400", negative: "bg-rose-500" };
                return (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["positive", "neutral", "negative"] as const)
                      .filter((k) => counts[k] > 0)
                      .map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-xs font-semibold text-mist tabular-nums">
                          <span className={cn("size-2 rounded-full", dot[k])} aria-hidden="true" />
                          {labels[k]} {counts[k]}
                        </span>
                      ))}
                  </div>
                );
              })()}
              {/* 声量迷你趋势：最近 14 天按日计数 */}
              {stats.mentionsTrend && stats.mentionsTrend.length > 0 && (
                <div className="mt-4 flex h-10 items-end gap-1 border-b border-line pb-px">
                  {(() => {
                    const max = Math.max(...stats.mentionsTrend!.map((t) => t.count), 1);
                    return stats.mentionsTrend!.map((t) => (
                      <div key={t.date} className="group relative flex-1" title={`${t.date} · ${t.count} 条`}>
                        <div
                          className="w-full rounded-t-sm bg-signal/60 transition-colors group-hover:bg-signal"
                          style={{ height: `${Math.max(8, (t.count / max) * 100)}%` }}
                        />
                      </div>
                    ));
                  })()}
                </div>
              )}
              <MentionsSection mentions={stats.mentions} />
            </section>
          </Reveal>
        )}

        {/* 社群能量报告：社群能量全景入口 */}
        <Reveal delay={0.1}>
          <Link
            to="/report"
            className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-signal/25 bg-gradient-to-r from-signal/10 to-transparent px-6 py-5 transition-colors hover:border-signal/50"
          >
            <div>
              <h2 className="text-xl font-bold">社群能量报告</h2>
            </div>
            <span className="rounded-full border border-signal/40 bg-signal/10 px-4 py-1.5 text-sm font-semibold text-signal">查看报告 →</span>
          </Link>
        </Reveal>
      </div>
    </>
  );
}


/** 今日动态 / 赛道速览 / 内容热点：三张「当下」卡，首页一眼看懂今天】
 * 今日动态 = 今日登阶 + 涨粉先锋；赛道速览 = 5 赛道规模 + 各赛道榜首；内容热点 = 近 30 天最热帖子 Top3 */
function TodayOverview({ stats }: { stats: DashboardStats }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayClimbs = stats.recentMilestones.filter((m) => m.achievedAt.slice(0, 10) === today);
  const growthChamp = [...stats.members].sort((a, b) => b.growth7d - a.growth7d)[0];
  const hotPosts = (stats.insights.viralPosts.length ? stats.insights.viralPosts : stats.topPosts).slice(0, 3);
  const gainRank = [...stats.members]
    .filter((m) => (m.viewsTodayGain ?? 0) > 0)
    .sort((a, b) => (b.viewsTodayGain ?? 0) - (a.viewsTodayGain ?? 0))
    .slice(0, 3);
  const trackRows = TRACKS.map((t) => {
    const ms = stats.members.filter((m) => m.tracks.includes(t.name));
    const top = [...ms].sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0))[0];
    return { name: t.name, count: ms.length, top };
  }).filter((x) => x.count > 0);

  return (
    <div className="mt-8 grid gap-3 lg:grid-cols-3">
      {/* 今日动态 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-mist">今日动态</h2>
        <div className="mt-3 space-y-2.5">
          {todayClimbs.length > 0 ? (
            todayClimbs.slice(0, 3).map((m) => (
              <Link key={`${m.memberId}-${m.threshold}`} to="/members/$id" params={{ id: m.memberId }} className="flex items-center gap-2 rounded-xl border border-signal/20 bg-signal/8 px-3 py-2 transition-colors hover:border-signal/40">
                <Avatar url={stats.members.find((x) => x.id === m.memberId)?.profileImage} name={m.displayName ?? m.handle} className="size-7 shrink-0" />
                <span className="truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                <span className="ml-auto shrink-0 text-xs font-semibold text-signal">拿下「{titleOf(m.threshold)}」</span>
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-line bg-soft-surface px-3 py-2 text-sm text-mist">今天还没有新登阶，称号正在路上。</div>
          )}
          {growthChamp && (growthChamp.growth7d ?? 0) > 0 && (
            <Link to="/members/$id" params={{ id: growthChamp.id }} className="flex items-center gap-2 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40">
              <Avatar url={growthChamp.profileImage} name={growthChamp.displayName ?? growthChamp.handle} className="size-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{growthChamp.displayName ?? growthChamp.handle}</span>
                <span className="block text-xs text-mist">近 7 天涨粉先锋</span>
              </span>
              <span className="shrink-0 text-sm font-bold text-signal tabular-nums">+{fmt(growthChamp.growth7d)}</span>
            </Link>
          )}
          {gainRank.length > 0 && (
            <div className="space-y-2.5 border-t border-line pt-2.5">
              <div className="text-xs font-semibold text-mist">今日曝光增量</div>
              {gainRank.map((m) => (
                <Link key={m.id} to="/members/$id" params={{ id: m.id }} className="flex items-center gap-2 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40">
                  <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                  <span className="shrink-0 text-sm font-bold text-signal tabular-nums">+{fmt(m.viewsTodayGain ?? 0)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 赛道速览 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-mist">赛道速览</h2>
        <ul className="mt-3 space-y-2">
          {trackRows.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 font-semibold">{r.name}</span>
              <span className="shrink-0 text-xs text-mist tabular-nums">{r.count} 人</span>
              {r.top && (
                <Link to="/members/$id" params={{ id: r.top.id }} className="min-w-0 flex-1 truncate text-right text-xs text-mist underline-offset-4 hover:text-ink hover:underline">
                  榜首 @{r.top.handle}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <Link to="/tracks" className="mt-3 inline-block text-xs font-semibold text-signal underline-offset-4 hover:underline">
          进入赛道 →
        </Link>
      </section>

      {/* 内容热点 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-mist">内容热点</h2>
        <ul className="mt-3 space-y-2">
          {hotPosts.length > 0 ? (
            hotPosts.map((p) => (
              <li key={p.tweetId}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 rounded-xl border border-line bg-soft-surface px-3 py-2 transition-colors hover:border-signal/40">
                  {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-7 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-mist">
                      {p.member ? (p.member.displayName ?? p.member.handle) : ""} · {postExcerpt(p.text) ?? "链接帖"}
                    </span>
                    <span className="block text-xs font-semibold tabular-nums">
                      {p.views != null ? `${fmt(p.views)} 浏览` : `${fmt(p.likes ?? 0)} 赞`}
                    </span>
                  </span>
                </a>
              </li>
            ))
          ) : (
            <li className="rounded-xl border border-line bg-soft-surface px-3 py-2 text-sm text-mist">帖子数据采集中，热点马上就来。</li>
          )}
        </ul>
        <Link to="/posts" className="mt-3 inline-block text-xs font-semibold text-signal underline-offset-4 hover:underline">
          全部内容 →
        </Link>
      </section>
    </div>
  );
}

/** 称号分布：分段条 + 图例。悬浮/点按分段或图例出气泡（人数 + 占比），点按可固定、再点取消，触屏可用 */
function TitleDistribution({ members }: { members: MemberStats[] }) {
  const novices = members.filter((m) => m.prevMilestone === 0).length;
  const census = [...MILESTONES]
    .reverse()
    .map(({ threshold, title }) => ({
      key: threshold,
      name: title,
      count: members.filter((m) => m.prevMilestone === threshold).length,
      fill: TITLE_FILL[threshold] ?? "#fbbf24",
    }))
    .filter((t) => t.count > 0);
  if (novices > 0) census.push({ key: 0, name: "新人村", count: novices, fill: TITLE_FILL[0] ?? "#94a3b8" });

  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hovered ?? pinned;

  const barRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef(new Map<number, HTMLButtonElement>());
  const [tipX, setTipX] = useState(0);

  // 气泡锚在激活分段的中点，两端按半宽收进条内，窄屏也不出画
  useEffect(() => {
    if (active == null) return;
    const bar = barRef.current;
    const seg = segRefs.current.get(active);
    if (!bar || !seg) return;
    const sr = seg.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const mid = sr.left - br.left + sr.width / 2;
    setTipX(Math.min(Math.max(mid, 84), bar.clientWidth - 84));
  }, [active]);

  if (census.length === 0) return null;
  const activeBucket = census.find((t) => t.key === active);
  const percent = (t: (typeof census)[number]) => Math.round((t.count / members.length) * 100);

  return (
    <>
      <div ref={barRef} className="relative mt-9 flex h-3 gap-0.5">
        {census.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              if (el) segRefs.current.set(t.key, el);
            }}
            type="button"
            aria-label={`${t.name} ${t.count} 人，占 ${percent(t)}%`}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(t.key)}
            onBlur={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === t.key ? null : t.key))}
            className={cn(
              "h-full min-w-1.5 cursor-pointer rounded-full transition-opacity",
              active != null && active !== t.key && "opacity-35"
            )}
            style={{ flexGrow: t.count, flexBasis: 0, background: t.fill }}
          />
        ))}
        {activeBucket && (
          <div className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2" style={{ left: tipX }}>
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-xl">
              <span className="size-2 rounded-full" style={{ background: activeBucket.fill }} aria-hidden="true" />
              {activeBucket.name}
              <b className="tabular-nums">{activeBucket.count} 人</b>
              <span className="font-normal text-mist tabular-nums">{percent(activeBucket)}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {census.map((t) => (
          <button
            key={t.key}
            type="button"
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(t.key)}
            onBlur={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === t.key ? null : t.key))}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              active === t.key
                ? "border-ink/30 bg-surface text-ink"
                : "border-line bg-soft-surface text-mist hover:text-ink"
            )}
          >
            <span className="size-2 rounded-full" style={{ background: t.fill }} aria-hidden="true" />
            {t.name}
            <b className="text-ink tabular-nums">{t.count}</b>
          </button>
        ))}
      </div>
    </>
  );
}

/** 冲线在即：距下一道大关最近的成员（最多 3 位），点卡片进成员档案 */
function NextGateRace({ members }: { members: MemberStats[] }) {
  const racers = members
    .filter((m) => m.latestFollowers != null)
    .map((m) => ({ m, remaining: m.nextMilestone - (m.latestFollowers ?? 0) }))
    .sort((a, b) => a.remaining - b.remaining || (b.m.latestFollowers ?? 0) - (a.m.latestFollowers ?? 0))
    .slice(0, 3);
  if (racers.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="text-sm font-semibold text-mist">冲线在即</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {racers.map(({ m, remaining }) => {
          const name = m.displayName ?? m.handle;
          const dailyRate = m.growth30d > 0 ? m.growth30d / 30 : 0;
          const etaDays = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;
          return (
            <Link
              key={m.id}
              to="/members/$id"
              params={{ id: m.id }}
              className="flex items-center gap-3 rounded-2xl border border-line bg-soft-surface px-3.5 py-3 transition-colors hover:border-signal/40"
            >
              <Avatar url={m.profileImage} name={name} className="size-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{name}</div>
                <GrowProgress
                  value={m.progressToNext}
                  className="mt-1.5 h-1"
                  ariaLabel={`距下一称号「${titleOf(m.nextMilestone)}」进度 ${m.progressToNext}%`}
                />
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-signal tabular-nums">还差 {fmt(remaining)}</div>
                <div className="mt-0.5 text-xs text-mist">
                  {etaDays != null ? `预计 ${etaDays} 天 · 「${titleOf(m.nextMilestone)}」` : `下一称号「${titleOf(m.nextMilestone)}」`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}