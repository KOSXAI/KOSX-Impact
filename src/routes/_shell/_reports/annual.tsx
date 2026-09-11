import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchAnnualReport } from "@/data.functions";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { StatCard } from "@/components/ui/StatCard";
import { groupClimbs, titleOf } from "@/milestones";
import { fmt, postExcerpt } from "@/lib/format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * 年度影响力报告：本年至今的社群叙事——YTD 增长 / 月度总粉丝 / 年度登阶 / Top 涨粉与声量 / 年度最火内容。
 * 入口在社群日报 / 能量报告页。
 */
export const Route = createFileRoute("/_shell/_reports/annual")({
  loader: () => fetchAnnualReport(),
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.year} 年度影响力报告 · ${SITE_NAME}` : `年度影响力报告 · ${SITE_NAME}`;
    return {
      meta: [
        { title },
        { name: "description", content: `${SITE_NAME} 年度报告：年度增长、月度趋势、登阶与最火内容。` },
        { property: "og:title", content: title },
        { property: "og:description", content: `${SITE_NAME} 年度报告：年度增长、月度趋势、登阶与最火内容。` },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/annual` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/annual` }],
    };
  },
  component: AnnualPage,
});

function AnnualPage() {
  const r = Route.useLoaderData();
  const maxMonth = Math.max(...r.monthlyTrend.map((m) => m.total), 1);

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{r.year} 年度影响力报告</h1>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="社群总粉丝" value={r.totalFollowers} />
            <StatCard label="追踪成员" value={r.memberCount} />
            <StatCard label="本年新增" value={r.ytdGrowth} prefix="+" highlight />
            <StatCard label="本年登阶" value={r.ytdClimbs} />
          </div>
        </Reveal>

        {/* 月度总粉丝趋势 */}
        {r.monthlyTrend.length >= 2 && (
          <Reveal delay={0.08}>
            <section className="mt-8 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
              <h2 className="text-xl font-bold">月度总粉丝</h2>
              <div className="mt-5 flex h-36 items-end gap-1.5">
                {r.monthlyTrend.map((m) => (
                  <div key={m.month} className="group relative flex-1" title={`${m.month} · ${fmt(m.total)}`}>
                    <div className="w-full rounded-t-md bg-signal/60 transition-colors group-hover:bg-signal" style={{ height: `${Math.max(6, (m.total / maxMonth) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-mist tabular-nums">
                <span>{r.monthlyTrend[0].month}</span>
                <span>{r.monthlyTrend[r.monthlyTrend.length - 1].month}</span>
              </div>
            </section>
          </Reveal>
        )}

        {/* 年度涨粉 Top + 年度声量 Top */}
        <Reveal delay={0.1}>
          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6">
              <h2 className="text-xl font-bold">年度涨粉 Top</h2>
              <ul className="mt-4 space-y-2.5">
                {r.topGrowers.map((m, i) => (
                  <li key={m.memberId}>
                    <Link to="/members/$id" params={{ id: m.memberId }} className="flex items-center gap-3 rounded-xl bg-soft-surface px-3 py-2.5 transition-colors hover:bg-wash-strong">
                      <span className="w-5 shrink-0 text-center font-bold text-mist tabular-nums">{i + 1}</span>
                      <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 font-bold text-signal-ink tabular-nums">+{fmt(m.growth)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6">
              <h2 className="text-xl font-bold">年度声量 Top</h2>
              <ul className="mt-4 space-y-2.5">
                {r.topMentions.map((m, i) => (
                  <li key={m.memberId}>
                    <Link to="/members/$id" params={{ id: m.memberId }} className="flex items-center gap-3 rounded-xl bg-soft-surface px-3 py-2.5 transition-colors hover:bg-wash-strong">
                      <span className="w-5 shrink-0 text-center font-bold text-mist tabular-nums">{i + 1}</span>
                      <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 font-bold text-signal-ink tabular-nums">{m.count} 次</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </Reveal>

        {/* 年度登阶 */}
        <Reveal delay={0.12}>
          <section className="mt-8 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
            <h2 className="text-xl font-bold">年度登阶</h2>
            {r.ytdClimbsList.length === 0 ? (
              <p className="mt-4 text-mist">今年还没有登阶记录，第一枚成就正在路上。</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {groupClimbs(r.ytdClimbsList).map((g) => {
                  const name = g.items[0].displayName ?? g.items[0].handle;
                  return (
                    <li key={g.key}>
                      <Link to="/members/$id" params={{ id: g.memberId }} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-soft-surface px-3 py-2.5 transition-colors hover:bg-wash-strong">
                        <Avatar url={g.items[0].profileImage} name={name} className="size-8 shrink-0" />
                        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
                        <span className="ml-auto flex min-w-0 flex-1 flex-wrap justify-end gap-1">
                          {[...g.items].sort((a, b) => a.threshold - b.threshold).map((c) => (
                            <span key={c.threshold} className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold-text">
                              「{titleOf(c.threshold)}」
                            </span>
                          ))}
                        </span>
                        <span className="shrink-0 text-xs text-mist tabular-nums">{g.date} · {g.items.length} 枚</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </Reveal>

        {/* 年度最火内容 */}
        {r.topPosts.length > 0 && (
          <Reveal delay={0.14}>
            <section className="mt-8 rounded-2xl bg-surface shadow-[var(--panel-elev)] p-6 sm:p-8">
              <h2 className="text-xl font-bold">年度最火内容</h2>
              <ul className="mt-4 space-y-2.5">
                {r.topPosts.map((p) => (
                  <li key={p.tweetId}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-soft-surface px-3 py-2.5 transition-colors hover:bg-wash-strong">
                      {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-8 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm">{postExcerpt(p.text, 60) ?? "链接帖"}</span>
                        <span className="mt-0.5 block text-xs text-mist">{p.member ? p.member.displayName ?? p.member.handle : ""} · {p.createdAt.slice(0, 10)}</span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">{p.views != null ? fmt(p.views) : "—"}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        )}
      </div>
    </>
  );
}

