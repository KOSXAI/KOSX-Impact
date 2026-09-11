import { createFileRoute } from "@tanstack/react-router";
import { fetchDashboard } from "@/data.functions";
import { CreatorLibrary } from "@/components/library/CreatorLibrary";
import {
  GROWTH_METRICS,
  VIEW_KEYS,
  type GrowthMetricKey,
  type GrowthRange,
  type LibrarySearch,
  type ViewKey,
} from "@/components/library/presets";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * 博主库：多维表格式的一页——同一份成员数据集，多种视图（口径）× 筛选 × 布局密度。
 * 视图/筛选状态全进 URL（可分享、可收录）；布局密度存 localStorage。
 * 旧的三页（榜单 /members 广场 / /tracks 列表）已收敛于此；/tracks/{slug} 赛道详情仍独立成页。
 */
export const Route = createFileRoute("/_shell/_creators/members/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const out: LibrarySearch = {};
    const view = String(search.view ?? "");
    if ((VIEW_KEYS as readonly string[]).includes(view)) out.view = view as ViewKey;
    const metric = String(search.metric ?? "");
    if (GROWTH_METRICS.some((x) => x.key === metric)) out.metric = metric as GrowthMetricKey;
    const range = String(search.range ?? "");
    if (range === "1") out.range = 1;
    else if (range === "7") out.range = 7;
    else if (range === "30") out.range = 30;
    if (String(search.gsort ?? "") === "growth") out.gsort = "growth";
    const track = String(search.track ?? "");
    if (track) out.track = track;
    const tag = String(search.tag ?? "");
    if (tag) out.tag = tag;
    const bucket = String(search.bucket ?? "");
    if (bucket === "lt10k" || bucket === "10k-50k" || bucket === "gt50k") out.bucket = bucket;
    return out;
  },
  loader: () => fetchDashboard(),
  head: () => {
    const title = `博主 · ${SITE_NAME}`;
    const desc =
      "博主库：总排行 / 成长 / 新锐 / 影响力 / 被提及 / 勤快 / 赛道分组多视图，单列 / 双列 / 卡片布局随心切换，赛道标签粉丝量筛选，复制 @ 清单批量关注。";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/members` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/members` }],
    };
  },
  component: LibraryPage,
});

function LibraryPage() {
  const stats = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // 状态统一回写 URL；undefined 的键从 URL 移除（保持裸路径 canonical 干净）
  const onPatch = (p: LibrarySearch) =>
    navigate({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...p };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        return next;
      },
      // 切视图/筛选是页面内状态变化：内容直接换，不走全页 View Transition
      // （整页上下滑动+淡入淡出只留给真正的页面跳转，库内连续切换会晃眼）
      viewTransition: false,
    });
  return (
    <CreatorLibrary
      stats={stats}
      view={search.view ?? "total"}
      growthMetric={search.metric ?? "growth"}
      growthRange={search.range ?? 30}
      trackSort={search.gsort ?? "followers"}
      selTracks={search.track ? search.track.split(",") : []}
      selTags={search.tag ? search.tag.split(",") : []}
      bucket={search.bucket ?? "all"}
      onPatch={onPatch}
    />
  );
}
