import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { postExcerpt, badge, fmt, fmtDate } from "@/lib/format";
import { titleOf } from "@/milestones";
import type { DashboardStats, MemberStats, PostItem } from "@/stats";

/**
 * 冠军卡三联：今天「谁在赢」的剧情区——涨粉之星 / 今日爆帖 / 登阶在望。
 * 头部主纪录 + 2 行次纪录，每张卡整卡可点进对应详情；空数据时落回兜底口径。
 */

/** 涨粉/负面 保底口径行卡，冠军卡三联的重排行 */
function MiniMemberRow({ m, value }: { m: MemberStats; value: string }) {
  const name = m.displayName ?? m.handle;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-soft-surface px-3 py-1.5 text-sm">
      <Avatar url={m.profileImage} name={name} className="size-6 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 font-bold text-signal tabular-nums">{value}</span>
    </div>
  );
}

function MiniPostRow({ p }: { p: PostItem }) {
  const excerpt = postExcerpt(p.text) ?? "链接帖";
  const value = (p.viewsGain ?? 0) > 0 ? `+${fmt(p.viewsGain!)} 浏览` : p.views != null ? `${fmt(p.views)} 浏览` : `${fmt(p.likes ?? 0)} 赞`;
  return (
    <div className="flex items-baseline gap-2 rounded-xl bg-soft-surface px-3 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-mist">{excerpt}</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-mist">{value}</span>
    </div>
  );
}

export function ChampionCards({ stats }: { stats: DashboardStats }) {
  // ① 涨粉之星：近 7 天涨粉 Top3
  const growthRanks = [...stats.members]
    .sort((a, b) => b.growth7d - a.growth7d)
    .filter((m) => m.growth7d > 0)
    .slice(0, 3);
  const champ = growthRanks[0];

  // ② 今日爆帖：24h 浏览增量 Top3，无增量数据时回退累计浏览
  const postRanks = (stats.trendingPosts?.length ? stats.trendingPosts : stats.topPosts).slice(0, 3);

  // ③ 登阶在望：距下一大关最近 + 照 30 天速度的 ETA
  const racers = stats.members
    .filter((m) => m.latestFollowers != null && m.nextMilestone > (m.latestFollowers ?? 0))
    .map((m) => ({
      m,
      remaining: m.nextMilestone - (m.latestFollowers ?? 0),
      etaDays: m.growth30d > 0 ? Math.ceil((m.nextMilestone - (m.latestFollowers ?? 0)) / (m.growth30d / 30)) : null,
    }))
    .sort((a, b) => a.remaining - b.remaining || (b.m.latestFollowers ?? 0) - (a.m.latestFollowers ?? 0))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* 涨粉之星 */}
      <section className="order-1 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-5">
        <h3 className="text-sm font-semibold text-mist">涨粉之星</h3>
        {champ ? (
          <>
            <Link to="/members/$id" params={{ id: champ.id }} className="mt-3 flex items-center gap-3">
              <Avatar url={champ.profileImage} name={champ.displayName ?? champ.handle} className="size-11 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{champ.displayName ?? champ.handle}</span>
                <span className="block text-2xl font-extrabold text-signal tabular-nums">+{fmt(champ.growth7d)}</span>
              </span>
            </Link>
            <div className="mt-2 text-xs font-semibold text-mist">
              距「{titleOf(champ.nextMilestone)}」还差 {fmt(champ.nextMilestone - (champ.latestFollowers ?? 0))}
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {growthRanks.slice(1).map((m, i) => (
                <div key={m.id} className="relative">
                  <span className="absolute -top-1 left-0.5 text-xs text-mist tabular-nums">{i + 2}</span>
                  <MiniMemberRow m={m} value={`+${fmt(m.growth7d)}`} />
                </div>
              ))}
            </div>
            <Link to="/members" search={{ view: "growth", metric: "growth", range: 7 }} className="mt-3 block text-xs font-semibold text-signal underline-offset-4 hover:underline">
              完整成长榜 →
            </Link>
          </>
        ) : (
          <div className="mt-3 text-sm text-mist">近 7 天还没有涨粉纪录。</div>
        )}
      </section>

      {/* 今日爆帖 */}
      <section className="order-2 rounded-2xl bg-signal/5 p-5">
        <h3 className="text-sm font-semibold text-mist">今日爆帖</h3>
        {postRanks[0] ? (
          <>
            {postRanks[0].member && (
              <Link to="/members/$id" params={{ id: postRanks[0].member.id }} className="mt-3 flex items-center gap-2.5">
                <Avatar url={postRanks[0].member.profileImage} name={postRanks[0].member.displayName ?? postRanks[0].member.handle} className="size-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{postRanks[0].member.displayName ?? postRanks[0].member.handle}</span>
                  <span className="block text-xs text-mist tabular-nums">{fmtDate(postRanks[0].createdAt)}</span>
                </span>
              </Link>
            )}
            <a
              href={postRanks[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block line-clamp-2 text-sm font-semibold text-ink"
              title={postRanks[0].text ?? undefined}
            >
              {postExcerpt(postRanks[0].text) ?? "链接帖"}
            </a>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
              {(postRanks[0].viewsGain ?? 0) > 0 && (
                <span className="text-2xl font-extrabold text-signal tabular-nums">+{fmt(postRanks[0].viewsGain!)} 流量</span>
              )}
              {postRanks[0].views != null && (
                <span className="text-sm font-bold text-ink tabular-nums">{fmt(postRanks[0].views)} 总浏览</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mist tabular-nums">
              {(postRanks[0].likes ?? 0) > 0 && <>{fmt(postRanks[0].likes ?? 0)} 赞</>}
              {(postRanks[0].bookmarks ?? 0) > 0 && <>{fmt(postRanks[0].bookmarks ?? 0)} 收藏</>}
              {(postRanks[0].quotes ?? 0) > 0 && <>{fmt(postRanks[0].quotes ?? 0)} 引用</>}
              {(postRanks[0].replies ?? 0) > 0 && <>{fmt(postRanks[0].replies ?? 0)} 评论</>}
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {postRanks.slice(1).map((p) => (
                <MiniPostRow key={p.tweetId} p={p} />
              ))}
            </div>
            <Link to="/posts" className="mt-3 block text-xs font-semibold text-signal underline-offset-4 hover:underline">
              完整推文榜 →
            </Link>
          </>
        ) : (
          <div className="mt-3 text-sm text-mist">帖子数据采集中，爆帖记录马上就来。</div>
        )}
      </section>

      {/* 登阶在望 */}
      <section className="order-3 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-5">
        <h3 className="text-sm font-semibold text-mist">登阶在望</h3>
        {racers.length > 0 ? (
          <>
            <div className="mt-3 space-y-2">
              {racers.map(({ m, remaining, etaDays }, i) => (
                <Link
                  key={m.id}
                  to="/members/$id"
                  params={{ id: m.id }}
                  className={i === 0 ? "block" : "group block"}
                >
                  <div className={i === 0 ? "flex items-center gap-3" : "flex items-center gap-2 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"}>
                    {i === 0 ? (
                      <>
                        <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-11 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-bold">{m.displayName ?? m.handle}</span>
                          <span className="block text-xs font-semibold text-mist tabular-nums">
                            {etaDays != null ? `照目前速度约 ${etaDays} 天` : "30 天暂无增长，速度未知"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-2xl font-extrabold text-signal tabular-nums">还差 {fmt(remaining)}</span>
                          <span className="mt-0.5 inline-block rounded-full bg-gold/10 px-2 py-0.5 text-[11px] text-gold-text font-bold text-amber-300">
                            至 {badge(m.nextMilestone)}「{titleOf(m.nextMilestone)}」
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-6 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm">{m.displayName ?? m.handle}</span>
                        <span className="shrink-0 text-xs text-mist tabular-nums">还差 {fmt(remaining)}</span>
                        <span className="shrink-0 text-xs font-bold text-signal tabular-nums">
                          {etaDays != null ? `约 ${etaDays} 天` : "—"}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <Link to="/members" className="mt-3 block text-xs font-semibold text-signal underline-offset-4 hover:underline">
              看全员冲关 →
            </Link>
          </>
        ) : (
          <div className="mt-3 text-sm text-mist">暂时没有成员在冲关。</div>
        )}
      </section>
    </div>
  );
}
