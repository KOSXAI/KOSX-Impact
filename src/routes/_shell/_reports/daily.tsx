import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard, fetchDailyArchive } from "@/data.functions";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { titleOf } from "@/milestones";
import { fmt, fmtDate, badge } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

/**
 * 社群日报：社群的「历史总览」——把今天的登阶、涨粉冠军、最爆内容、赛道表现、品牌声量
 * 汇总成一份战报。每天自动更新，属于首页模块的时间切片（顶栏高亮「首页」）。
 * ?date=YYYY-MM-DD 查看历史归档（数据透明 / 可追溯）。
 */
export const Route = createFileRoute("/_shell/_reports/daily")({
  validateSearch: (search: Record<string, unknown>) => ({ date: typeof search.date === "string" ? search.date : "" }),
  loader: async ({ location }) => {
    const date = (location.search as { date?: string }).date;
    if (date) return { archive: await fetchDailyArchive({ data: date }), stats: null as Awaited<ReturnType<typeof fetchDashboard>> | null };
    return { archive: null, stats: await fetchDashboard() };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.archive
      ? `社群日报 ${loaderData.archive.date} · ${SITE_NAME}`
      : `社群日报 · ${SITE_NAME}`;
    return {
      meta: [
        { title },
        { name: "description", content: `${SITE_NAME} 社群日报：今日登阶、涨粉冠军、最爆内容、赛道表现与品牌声量。` },
        { property: "og:title", content: title },
        { property: "og:description", content: SLOGAN },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/daily` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: DailyPage,
});

function DailyPage() {
  const { archive, stats } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  if (archive) return <ArchiveView archive={archive} onBack={() => navigate({ search: { date: "" } })} />;
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
            <DailyStat label="追踪成员" value={stats.members.length} />
            <DailyStat label="社群总粉丝" value={stats.totalFollowers} />
            <DailyStat label="近 30 天新增" value={stats.totalGrowth30d} prefix="+" highlight />
            <DailyStat label="万粉成员" value={stats.tenKMembers} />
          </div>
        </Reveal>

        {/* 今日登阶 */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">今日登阶</h2>
            {todayClimbs.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {todayClimbs.map((m) => (
                  <li key={`${m.memberId}-${m.threshold}`}>
                    <Link to="/members/$id" params={{ id: m.memberId }} className="flex items-center gap-3 rounded-xl border border-signal/20 bg-signal/8 px-4 py-3 transition-colors hover:border-signal/40">
                      <Avatar url={byId.get(m.memberId)?.profileImage} name={m.displayName ?? m.handle} className="size-9 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 text-sm font-semibold text-signal">
                        拿下「{titleOf(m.threshold)}」· {badge(m.threshold)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-mist">今天还没有新登阶，第一枚成就正在路上。</p>
            )}
          </section>
        </Reveal>

        {/* 涨粉冠军 + 赛道表现 */}
        <Reveal delay={0.1}>
          <div className="mt-8 grid gap-3 lg:grid-cols-2">
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
                    <div className="text-xl font-bold text-signal tabular-nums">+{fmt(growthChamp.growth30d)}</div>
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
                        <Link to="/tracks/$slug" params={{ slug: t.slug }} className="w-14 shrink-0 font-semibold hover:text-signal">{t.name}</Link>
                        <span className="text-xs text-mist tabular-nums">{t.memberCount} 人</span>
                        <span className="ml-auto text-xs text-mist tabular-nums">30 天</span>
                        <b className="shrink-0 text-signal tabular-nums">+{fmt(t.growth30dTotal)}</b>
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
                  <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40">
                    {p.member && <Avatar url={p.member.profileImage} name={p.member.displayName ?? p.member.handle} className="size-9 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm">{p.text ?? "帖子"}</div>
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
                    <a href={mn.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-xl border border-line bg-soft-surface px-4 py-3 transition-colors hover:border-signal/40">
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
            <DailyStat label="当日成员" value={archive.memberCount} />
            <DailyStat label="当日总粉丝" value={archive.totalFollowers} />
            <DailyStat label="当日新增成员" value={archive.newJoins} highlight />
            <DailyStat label="当日品牌提及" value={archive.mentionsCount} />
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">当日登阶</h2>
            {archive.climbs.length === 0 ? (
              <p className="mt-4 text-mist">这一天没有登阶记录。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {archive.climbs.map((m) => (
                  <li key={`${m.memberId}-${m.threshold}`}>
                    <Link to="/members/$id" params={{ id: m.memberId }} className="flex items-center gap-3 rounded-xl border border-signal/20 bg-signal/8 px-4 py-3 transition-colors hover:border-signal/40">
                      <span className="min-w-0 flex-1 truncate font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 text-sm font-semibold text-signal">
                        拿下「{titleOf(m.threshold)}」· {badge(m.threshold)}
                      </span>
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

function DailyStat({ label, value, prefix = "", highlight = false }: { label: string; value: number; prefix?: string; highlight?: boolean }) {
  return (
    <div className={`card-lift rounded-2xl border p-4 ${highlight ? "border-signal/30" : "border-line"} bg-surface`}>
      <div className="text-xs font-medium text-mist sm:text-sm">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? "text-signal" : ""}`}>
        {prefix}{fmt(value)}
      </div>
    </div>
  );
}

function sentimentText(s: string): string {
  if (s === "positive") return "正面";
  if (s === "negative") return "负面";
  return "中性";
}
