import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard, fetchDailyArchive } from "@/data.functions";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { StatCard } from "@/components/ui/StatCard";
import { groupClimbs, titleOf } from "@/milestones";
import { fmt, fmtDate, postExcerpt } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

/**
 * 社群日报：社群的「历史总览」——把今天的登阶、涨粉冠军、最爆内容、赛道表现、品牌声量
 * 汇总成一份战报。每天自动更新，属于首页模块的时间切片（顶栏高亮「首页」）。
 * ?date=YYYY-MM-DD 查看历史归档（数据透明 / 可追溯）。
 */
export const Route = createFileRoute("/_shell/_reports/daily")({
  // date 只在「合法 YYYY-MM-DD」时进 URL：缺省不回填（避免 /daily 307 成 ?date=），
  // 乱串参数直接忽略（回当天版），不给搜索引擎造出全 0 的可收录变体
  validateSearch: (search: Record<string, unknown>) => {
    const date = typeof search.date === "string" ? search.date : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { date };
    return {};
  },
  loader: async ({ location }) => {
    const date = (location.search as { date?: string }).date;
    if (date) return { archive: await fetchDailyArchive({ data: date }), stats: null as Awaited<ReturnType<typeof fetchDashboard>> | null };
    return { archive: null, stats: await fetchDashboard() };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.archive
      ? `社群日报 ${loaderData.archive.date} · ${SITE_NAME}`
      : `社群日报 · ${SITE_NAME}`;
    const url = loaderData?.archive ? `${SITE_URL}/daily?date=${loaderData.archive.date}` : `${SITE_URL}/daily`;
    return {
      meta: [
        { title },
        { name: "description", content: `${SITE_NAME} 社群日报：今日登阶、涨粉冠军、最爆内容、赛道表现与品牌声量。` },
        { property: "og:title", content: title },
        { property: "og:description", content: SLOGAN },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: DailyPage,
});

function DailyPage() {
  const { archive, stats } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  if (archive) return <ArchiveView archive={archive} onBack={() => navigate({ search: {} })} />;
  if (!stats) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayClimbs = stats.recentMilestones.filter((m) => m.achievedAt.slice(0, 10) === today);
  const growthChamp = [...stats.members].sort((a, b) => b.growth30d - a.growth30d)[0];
  const hotPosts = (stats.insights.viralPosts.length ? stats.insights.viralPosts : stats.topPosts).slice(0, 5);
  const bestTrack = [...stats.trackStats].sort((a, b) => b.growth30dTotal - a.growth30dTotal)[0];
  const byId = new Map(stats.members.map((m) => [m.id, m]));

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">社群日报</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-mist tabular-nums">{fmtDate(today)} · 每日更新</span>
              <Link to="/annual" className="inline-flex h-9 items-center rounded-full border border-line bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink">
                年度报告 →
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="追踪成员" value={stats.members.length} />
            <StatCard label="社群总粉丝" value={stats.totalFollowers} />
            <StatCard label="近 30 天新增" value={stats.totalGrowth30d} prefix="+" highlight />
            <StatCard label="万粉成员" value={stats.tenKMembers} />
          </div>
        </Reveal>

        {/* 今日登阶 */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">今日登阶</h2>
            {todayClimbs.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {groupClimbs(todayClimbs).map((g) => {
                  const name = g.items[0].displayName ?? g.items[0].handle;
                  return (
                    <li key={g.key}>
                      <Link to="/members/$id" params={{ id: g.memberId }} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-signal/20 bg-signal/8 px-4 py-3 transition-colors hover:border-signal/40">
                        <Avatar url={byId.get(g.memberId)?.profileImage} name={name} className="size-9 shrink-0" />
                        <span className="min-w-0 truncate font-semibold">{name}</span>
                        <span className="ml-auto flex min-w-0 flex-1 flex-wrap justify-end gap-1">
                          {[...g.items].sort((a, b) => a.threshold - b.threshold).map((c) => (
                            <span key={c.threshold} className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold-text">
                              「{titleOf(c.threshold)}」
                            </span>
                          ))}
                        </span>
                        {g.items.length > 1 && (
                          <span className="shrink-0 text-xs font-semibold text-signal-ink tabular-nums">{g.items.length} 枚</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-mist">今天还没有新登阶，第一枚成就正在路上。</p>
            )}
          </section>
        </Reveal>

        {/* 涨粉冠军 + 赛道表现 */}
        <Reveal delay={0.1}>
          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {growthChamp && (
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="text-xl font-bold">近 30 天涨粉冠军</h2>
                <Link to="/members/$id" params={{ id: growthChamp.id }} className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40">
                  <Avatar url={growthChamp.profileImage} name={growthChamp.displayName ?? growthChamp.handle} className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{growthChamp.displayName ?? growthChamp.handle}</div>
                    <div className="truncate text-xs text-mist">@{growthChamp.handle}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xl font-bold text-signal-ink tabular-nums">+{fmt(growthChamp.growth30d)}</div>
                    <div className="text-xs text-mist tabular-nums">近 7 天 +{fmt(growthChamp.growth7d)}</div>
                  </div>
                </Link>
              </section>
            )}
            {bestTrack && bestTrack.memberCount > 0 && (
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="text-xl font-bold">赛道表现</h2>
                <ul className="mt-4 space-y-2.5">
                  {[...stats.trackStats]
                    .filter((t) => t.memberCount > 0)
                    .sort((a, b) => b.growth30dTotal - a.growth30dTotal)
                    .slice(0, 5)
                    .map((t) => (
                      <li key={t.slug} className="flex items-center gap-2 text-sm">
                        <Link to="/tracks/$slug" params={{ slug: t.slug }} className="w-14 shrink-0 font-semibold hover:text-signal-ink">{t.name}</Link>
                        <span className="text-xs text-mist tabular-nums">{t.memberCount} 人</span>
                        <span className="ml-auto text-xs text-mist tabular-nums">30 天</span>
                        <b className="shrink-0 text-signal-ink tabular-nums">+{fmt(t.growth30dTotal)}</b>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>
        </Reveal>

        {/* 最爆内容 */}
        <Reveal delay={0.12}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">最爆内容</h2>
            <ul className="mt-4 space-y-3">
              {hotPosts.map((p) => (
                <li key={p.tweetId}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40">
                    {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-9 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm">{postExcerpt(p.text, 60) ?? "链接帖"}</div>
                      <div className="mt-0.5 text-xs text-mist">
                        {p.member ? (p.member.displayName ?? p.member.handle) : ""} · {fmtDate(p.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <div className="font-bold tabular-nums">{p.views != null ? fmt(p.views) : "—"}</div>
                      <div className="text-xs text-mist">浏览</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        {/* 品牌声量 */}
        {stats.mentions.length > 0 && (
          <Reveal delay={0.14}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">品牌声量</h2>
              <ul className="mt-4 space-y-3">
                {stats.mentions.slice(0, 8).map((mn) => (
                  <li key={mn.url ?? `${mn.authorHandle}-${mn.collectedAt}`}>
                    <a href={mn.url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm">{mn.text}</span>
                        <span className="mt-1 block text-xs text-mist">
                          @{mn.authorHandle} · {fmtDate(mn.collectedAt)}
                        </span>
                      </span>
                      {mn.sentiment && (
                        <span className="shrink-0 text-xs font-semibold text-mist">{sentimentText(mn.sentiment)}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        )}

        {/* 历史归档：最近 7 天的日报快照（数据透明，逐日可追溯） */}
        <Reveal delay={0.15}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">历史归档</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...new Set(stats.trend.map((t) => t.date))]
                .filter((d) => d < today)
                .slice(-7)
                .reverse()
                .map((d) => (
                  <Link
                    key={d}
                    to="/daily"
                    search={{ date: d }}
                    className="rounded-full border border-line bg-soft-surface px-3.5 py-1.5 text-sm font-semibold text-mist tabular-nums transition-colors hover:border-signal/40 hover:text-ink"
                  >
                    {d}
                  </Link>
                ))}
            </div>
          </section>
        </Reveal>
      </div>
    </>
  );
}

/** 历史归档视图：某一天的社群快照（当日总粉丝 / 当日登阶 / 当日提及） */
function ArchiveView({ archive, onBack }: { archive: NonNullable<Awaited<ReturnType<typeof fetchDailyArchive>>>; onBack: () => void }) {
  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">社群日报</h1>
              <p className="mt-2 text-sm font-semibold text-mist tabular-nums">{archive.date} · 历史归档</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center rounded-full border border-line bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
            >
              ← 最新一期
            </button>
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="当日成员" value={archive.memberCount} />
            <StatCard label="当日总粉丝" value={archive.totalFollowers} />
            <StatCard label="当日新增成员" value={archive.newJoins} highlight />
            <StatCard label="当日品牌提及" value={archive.mentionsCount} />
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">当日登阶</h2>
            {archive.climbs.length === 0 ? (
              <p className="mt-4 text-mist">这一天没有登阶记录。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {groupClimbs(archive.climbs).map((g) => (
                  <li key={g.key}>
                    <Link to="/members/$id" params={{ id: g.memberId }} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-signal/20 bg-signal/8 px-4 py-3 transition-colors hover:border-signal/40">
                      <span className="min-w-0 truncate font-semibold">{g.items[0].displayName ?? g.items[0].handle}</span>
                      <span className="ml-auto flex min-w-0 flex-1 flex-wrap justify-end gap-1">
                        {[...g.items].sort((a, b) => a.threshold - b.threshold).map((c) => (
                          <span key={c.threshold} className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold-text">
                            「{titleOf(c.threshold)}」
                          </span>
                        ))}
                      </span>
                      {g.items.length > 1 && (
                        <span className="shrink-0 text-xs font-semibold text-signal-ink tabular-nums">{g.items.length} 枚</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
      </div>
    </>
  );
}


function sentimentText(s: string): string {
  if (s === "positive") return "正面";
  if (s === "negative") return "负面";
  return "中性";
}
