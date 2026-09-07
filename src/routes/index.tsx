import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { MemberStats } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, GrowProgress, PopIn, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { MentionsSection } from "@/components/dashboard/MentionsSection";
import { SiteHeader } from "@/components/SiteHeader";
import { MILESTONES, TITLE_FILL, titleOf } from "@/milestones";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
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
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = Route.useLoaderData();
  const latest = stats.recentMilestones[0];
  const justAchieved = latest && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  const totalClimbs = stats.members.reduce((sum, m) => sum + m.climbs, 0);
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{SITE_NAME}</h1>
          <p className="mt-3 max-w-2xl text-mist">{SLOGAN}榜单、赛道、内容等模块都在顶部导航里，这里是一切的总览。</p>
        </Reveal>

        {/* 数据卡：社群的四个侧面 */}
        <RevealGroup className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
          <RevealItem>
            <StatCard label="社群粉丝" value={stats.totalFollowers} />
          </RevealItem>
          <RevealItem>
            <StatCard label="近 30 天新增" value={stats.totalGrowth30d} prefix="+" />
          </RevealItem>
          <RevealItem>
            <StatCard label="万粉成员" value={stats.tenKMembers} />
          </RevealItem>
          <RevealItem>
            <StatCard label="追踪成员" value={stats.members.length} />
          </RevealItem>
        </RevealGroup>

        {/* 社群全景：称号分布（悬浮/点按看明细）+ 冲线在即 + 总量趋势（数据点满 2 天自动出现折线） */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">社群全景</h2>
              {totalClimbs > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist"
                  title="成员累计领下的称号数"
                >
                  🏅 已领 <b className="text-ink tabular-nums">{totalClimbs}</b> 枚称号
                </span>
              )}
            </div>
            <TitleDistribution members={stats.members} />
            <NextGateRace members={stats.members} />
            {stats.trend.length >= 2 && (
              <div className="mt-6 border-t border-line pt-6">
                <TrendChart data={stats.trend} />
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

        {/* 品牌声量：站外对 KOSX 的提及（Grok 定时搜索） */}
        {stats.mentions.length > 0 && (
          <Reveal delay={0.08}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">品牌声量</h2>
              <MentionsSection mentions={stats.mentions} />
            </section>
          </Reveal>
        )}

        <Reveal delay={0.1}>
          <section className="mt-12 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">加入这场远征</h2>
            <p className="mt-2 max-w-2xl text-mist">
              和社群一起冲刺下一个称号大关——提交你的 X 主页，从今天开始记录成长。
            </p>
            <div className="mt-5">
              <Button onClick={() => setApplyOpen(true)}>加入追踪</Button>
            </div>
          </section>
        </Reveal>

        <SubmitDialog open={applyOpen} onOpenChange={setApplyOpen} />
      </div>
    </>
  );
}

function StatCard({ label, value, prefix = "" }: { label: string; value: number; prefix?: string }) {
  return (
    <Card className="card-lift h-full">
      <CardContent className="px-5 py-4">
        <div className="text-sm text-mist">{label}</div>
        <AnimatedNumber value={value} prefix={prefix} className="mt-1.5 block text-2xl font-bold tabular-nums sm:text-3xl" />
      </CardContent>
    </Card>
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
                <div className="mt-0.5 text-xs text-mist">下一称号「{titleOf(m.nextMilestone)}」</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}