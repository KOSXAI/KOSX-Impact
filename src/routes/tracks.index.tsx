import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import type { TrackStats } from "@/stats";
import { TRACKS, TRACK_OTHER } from "@/tracks";
import { TrackSection } from "@/components/dashboard/TrackSection";
import { MemberModuleHeader } from "@/components/member/MemberModuleHeader";
import { Reveal } from "@/components/motion";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ArrowUpRight, Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

/** 赛道图标映射（src/tracks.ts 存图标名字符串，组件侧映射到 lucide 组件） */
const TRACK_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

export const Route = createFileRoute("/tracks/")({
  loader: () => fetchDashboard(),
  head: ({ loaderData }) => {
    const desc = loaderData
      ? [
          ...TRACKS.map((t) => {
            const s = loaderData.trackStats.find((x) => x.slug === t.slug);
            return s ? `${t.name} ${s.memberCount} 位` : t.name;
          }).join("、"),
          "——按粉丝量 / 本周增长 / 帖子互动三重口径排的赛道榜单。",
        ].join("")
      : "赛道榜单";
    return {
      meta: [
        { title: `赛道 · ${SITE_NAME}` },
        { name: "description", content: `${SITE_NAME} 赛道：${desc}` },
        { property: "og:title", content: `赛道 · ${SITE_NAME}` },
        { property: "og:description", content: SLOGAN },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/tracks` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
      ],
    };
  },
  component: TracksPage,
});

function TracksPage() {
  const stats = Route.useLoaderData();
  const trackStats = stats.trackStats;

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      {/* 博主模块统一页头：标题 + 三视图门牌卡（榜单 / 广场 / 赛道） */}
      <MemberModuleHeader view="tracks" stats={stats} title="赛道" />

      {/* 赛道导航卡：直达每个赛道的独立页（SEO 收录 + 批量关注 + 分享） */}
      <Reveal delay={0.06}>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRACKS.map((t) => {
            const stat: TrackStats | undefined = trackStats.find((s) => s.slug === t.slug);
            if (!stat || stat.memberCount === 0) return null;
            const Icon = TRACK_ICONS[t.icon] ?? Shapes;
            return (
              <Link
                key={t.slug}
                to="/tracks/$slug"
                params={{ slug: t.slug }}
                className="group block h-full select-none"
              >
                <SpotlightCard className="h-full p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lg hover:shadow-black/50">
                  <div className="flex items-center gap-3">
                    <div className="icon-dock inline-flex size-10 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <Icon className="size-5 text-signal" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        {t.name}
                        <ArrowUpRight
                          className="size-3.5 text-mist transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-signal"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-mist">{t.description}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-x-5 gap-y-1 text-sm text-mist">
                    <span>
                      成员 <b className="text-ink tabular-nums">{stat.memberCount}</b>
                    </span>
                    <span>
                      粉丝 <b className="text-ink tabular-nums">{fmt(stat.totalFollowers)}</b>
                    </span>
                    <span className="tabular-nums">
                      30 天 <b className="text-signal">+{fmt(stat.growth30dTotal)}</b>
                    </span>
                  </div>
                </SpotlightCard>
              </Link>
            );
          })}
          <div className="flex flex-col justify-between rounded-2xl border border-dashed border-line bg-soft-surface p-5">
            <div className="flex items-center gap-3">
              <div className="icon-dock inline-flex size-10 shrink-0 items-center justify-center">
                <Shapes className="size-5 text-mist" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{TRACK_OTHER.name}</div>
                <div className="mt-0.5 truncate text-xs text-mist">{TRACK_OTHER.description}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-mist">
              过渡桶不参与榜单，攒够人数后细分出新赛道
            </div>
          </div>
        </div>
      </Reveal>

      {/* 赛道榜：选择器 + 存量/增长/帖子互动三重口径 */}
      <Reveal delay={0.08}>
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-bold">赛道榜</h2>
          <TrackSection members={stats.members} trackStats={trackStats} />
        </section>
      </Reveal>
    </div>
  );
}