import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/member/Avatar";
import { postExcerpt, badge, fmt, fmtDate } from "@/lib/format";
import { titleOf } from "@/milestones";
import type { DashboardStats, MemberStats, PostItem } from "@/stats";

/**
 * 冠军卡三联：今天「谁在赢」的剧情区——涨粉之星 / 今日爆帖 / 登阶在望。
 * 三卡同构骨架 = 标题行 + 冠军主体（头像+名+一个大数）+ 次榜行 + 完整榜入口，
 * 只给一个大数，次级数据一律降灰并排。
 */

/** 次榜行：三卡共用的统一行卡（名次在行内，不再用卡外裸角标） */
function MiniMemberRow({ rank, m, main, sub }: { rank?: number; m: MemberStats; main: string; sub?: string }) {
  const name = m.displayName ?? m.handle;
  return (
    <Link
      to="/members/$id"
      params={{ id: m.id }}
      className="flex items-center gap-2 rounded-xl bg-soft-surface px-3 py-1.5 transition-colors hover:bg-wash-strong"
    >
      {rank != null && <span className="w-4 shrink-0 text-right text-xs text-mist tabular-nums">{rank}</span>}
      <Avatar url={m.profileImage} name={name} className="size-6 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {sub && <span className="shrink-0 text-xs text-mist tabular-nums">{sub}</span>}
      <span className="shrink-0 text-sm font-bold text-signal tabular-nums">{main}</span>
    </Link>
  );
}

function MiniPostRow({ p }: { p: PostItem }) {
  const excerpt = postExcerpt(p.text) ?? "链接帖";
  const value = (p.viewsGain ?? 0) > 0 ? `+${fmt(p.viewsGain!)} 浏览` : p.views != null ? `${fmt(p.views)} 浏览` : `${fmt(p.likes ?? 0)} 赞`;
  return (
    <div className="flex items-baseline gap-2 rounded-xl bg-soft-surface px-3 py-1.5 text-sm">
      {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-6 shrink-0" />}
      <span className="min-w-0 flex-1 truncate text-mist">{excerpt}</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-mist">{value}</span>
    </div>
  );
}

/** 冠军主体：头像+名+单一大数，三卡同构 */
function ChampHead({ m, value }: { m: MemberStats; value: React.ReactNode }) {
  const name = m.displayName ?? m.handle;
  return (
    <Link to="/members/$id" params={{ id: m.id }} className="mt-3 flex items-center gap-3">
      <Avatar url={m.profileImage} name={name} className="size-11 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{name}</span>
        <span className="block text-2xl font-extrabold text-signal tabular-nums">{value}</span>
      </span>
    </Link>
  );
}

export function ChampionCards({ stats }: { stats: DashboardStats }) {
  // ① 涨粉之星：近 7 天涨粉 Top3
  const growthRanks = [...stats.members]
    .sort((a, b) => b.growth7d - a.growth7d)
    .filter((m) => m.growth7d > 0)
    .slice(0, 5);
  const champ = growthRanks[0];

  // ② 今日爆帖：24h 浏览增量 Top3，无增量数据时回退累计浏览
  const postRanks = (stats.trendingPosts?.length ? stats.trendingPosts : stats.topPosts).slice(0, 5);

  // ③ 登阶在望：距下一大关最近 + 照 30 天速度的 ETA（速度慢到没有意义时不给约数）
  const racers = stats.members
    .filter((m) => m.latestFollowers != null && m.nextMilestone > (m.latestFollowers ?? 0))
    .map((m) => ({
      m,
      remaining: m.nextMilestone - (m.latestFollowers ?? 0),
      etaDays: m.growth30d > 0 ? Math.ceil((m.nextMilestone - (m.latestFollowers ?? 0)) / (m.growth30d / 30)) : null,
    }))
    .sort((a, b) => a.remaining - b.remaining || (b.m.latestFollowers ?? 0) - (a.m.latestFollowers ?? 0))
    .slice(0, 5);
  const etaText = (etaDays: number | null) => (etaDays != null && etaDays <= 90 ? `约 ${etaDays} 天` : "遥遥无期");

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* 涨粉之星 */}
      <section className="order-1 flex flex-col rounded-2xl bg-surface shadow-[var(--panel-elev)] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-mist">涨粉之星</h3>
          <Link to="/members" search={{ view: "growth", metric: "growth", range: 7 }} className="shrink-0 text-xs font-semibold text-signal underline-offset-4 hover:underline">完整成长榜 ›</Link>
        </div>
        {champ ? (
          <>
            <div className="flex flex-1 flex-col justify-center">
              <ChampHead m={champ} value={`+${fmt(champ.growth7d)}`} />
              <div className="mt-2 text-xs font-semibold text-mist">
                距「{titleOf(champ.nextMilestone)}」还差 {fmt(champ.nextMilestone - (champ.latestFollowers ?? 0))}
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {growthRanks.slice(1).map((m, i) => (
                <MiniMemberRow key={m.id} rank={i + 2} m={m} main={`+${fmt(m.growth7d)}`} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 flex min-h-40 flex-1 items-center justify-center text-sm text-mist">近 7 天还没有涨粉纪录。</div>
        )}
      </section>

      {/* 今日爆帖 */}
      <section className="order-2 flex flex-col rounded-2xl bg-signal/5 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-mist">今日爆帖</h3>
          <Link to="/posts" className="shrink-0 text-xs font-semibold text-signal underline-offset-4 hover:underline">完整推文榜 ›</Link>
        </div>
        {postRanks[0] ? (
          <>
            <div className="flex flex-1 flex-col justify-center">
              {postRanks[0].member && (
                <Link to="/members/$id" params={{ id: postRanks[0].member.id }} className="mt-3 flex items-center gap-3">
                  <Avatar url={postRanks[0].member.profileImage} name={postRanks[0].member.displayName ?? postRanks[0].member.handle} className="size-11 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{postRanks[0].member.displayName ?? postRanks[0].member.handle}</span>
                    <span className="block text-xs text-mist tabular-nums">{fmtDate(postRanks[0].createdAt)}</span>
                  </span>
                </Link>
              )}
              <a
                href={postRanks[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block line-clamp-2 text-xs font-medium text-mist"
                title={postRanks[0].text ?? undefined}
              >
                {postExcerpt(postRanks[0].text) ?? "链接帖"}
              </a>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-2xl font-extrabold text-signal tabular-nums">
                  {(postRanks[0].viewsGain ?? 0) > 0 ? <>+{fmt(postRanks[0].viewsGain!)} 流量</> : <>{fmt(postRanks[0].views ?? postRanks[0].likes ?? 0)} 浏览</>}
                </span>
                {postRanks[0].views != null && (postRanks[0].viewsGain ?? 0) > 0 && (
                  <span className="text-xs font-semibold text-mist tabular-nums">总浏览 {fmt(postRanks[0].views!)}</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-mist tabular-nums">
                {(postRanks[0].likes ?? 0) > 0 && <>{fmt(postRanks[0].likes ?? 0)} 赞</>}
                {(postRanks[0].bookmarks ?? 0) > 0 && <>{fmt(postRanks[0].bookmarks ?? 0)} 收藏</>}
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {postRanks.slice(1).map((p) => (
                <MiniPostRow key={p.tweetId} p={p} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 flex min-h-40 flex-1 items-center justify-center text-sm text-mist">帖子数据采集中，爆帖记录马上就来。</div>
        )}
      </section>

      {/* 登阶在望 */}
      <section className="order-3 flex flex-col rounded-2xl bg-surface shadow-[var(--panel-elev)] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-mist">登阶在望</h3>
          <Link to="/members" search={{ view: "growth", metric: "growth", range: 30 }} className="shrink-0 text-xs font-semibold text-signal underline-offset-4 hover:underline">看全员冲关 ›</Link>
        </div>
        {racers.length > 0 ? (
          <>
            <div className="flex flex-1 flex-col justify-center">
              <ChampHead m={racers[0].m} value={<>还差 {fmt(racers[0].remaining)}</>} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-mist">
                <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  至 {badge(racers[0].m.nextMilestone)}「{titleOf(racers[0].m.nextMilestone)}」
                </span>
                {racers[0].etaDays != null && <span className="tabular-nums">照目前速度 {etaText(racers[0].etaDays)}</span>}
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {racers.slice(1).map(({ m, remaining, etaDays }, i) => (
                <MiniMemberRow key={m.id} rank={i + 2} m={m} main={`还差 ${fmt(remaining)}`} sub={etaText(etaDays)} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 flex min-h-40 flex-1 items-center justify-center text-sm text-mist">暂时没有成员在冲关。</div>
        )}
      </section>
    </div>
  );
}
