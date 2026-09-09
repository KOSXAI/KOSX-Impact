import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchDashboard, fetchReportExtras, fetchInviteLeaders } from "@/data.functions";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { StatCard } from "@/components/ui/StatCard";
import { toast } from "@/components/ui/toast";
import { Download } from "lucide-react";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * 社群能量报告：社群能量全景聚合页——总影响力、赛道分布、
 * 粉丝质量（画像聚合）、影响力与声量 Top、邀请裂变荣誉榜。入口在首页底部与日报页。
 */
export const Route = createFileRoute("/_shell/_reports/report")({
  loader: async () => {
    const [stats, extras, inviteLeaders] = await Promise.all([fetchDashboard(), fetchReportExtras(), fetchInviteLeaders()]);
    return { stats, extras, inviteLeaders };
  },
  head: () => ({
    meta: [
      { title: `社群能量报告 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME} 社群能量报告：总影响力、赛道分布、粉丝质量与影响力 Top 全景。` },
      { property: "og:title", content: `社群能量报告 · ${SITE_NAME}` },
      { property: "og:description", content: "KOSX 影响力的全套可验证证据。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/report` },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/report` }],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { stats, extras, inviteLeaders } = Route.useLoaderData();
  const fan = extras.fanRows;

  const exportReport = async () => {
    const influenceTop = [...stats.members]
      .filter((m) => m.influence != null)
      .sort((a, b) => (b.influence?.score ?? -1) - (a.influence?.score ?? -1))
      .slice(0, 5)
      .map((m, i) => `${i + 1}. ${m.displayName ?? m.handle}（${m.influence?.score ?? 0}）`)
      .join("；");
    const trackLine = stats.trackStats
      .filter((t) => t.memberCount > 0)
      .sort((a, b) => b.memberCount - a.memberCount)
      .map((t) => `${t.name} ${t.memberCount}人/${fmt(t.totalFollowers)}粉`)
      .join("、");
    const lines = [
      `KOSX 社群能量报告`,
      `追踪成员 ${stats.members.length} · 社群总粉丝 ${fmt(stats.totalFollowers)} · 近30天新增 +${fmt(stats.totalGrowth30d)} · 万粉成员 ${stats.tenKMembers}`,
      `赛道分布：${trackLine}`,
      `影响力 Top5：${influenceTop}`,
      `数据来源：成员账号公开信息，每日更新；完整口径见 https://impact.kosx.ai/about`,
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("报告摘要已复制，可粘贴分享");
    } catch {
      // 剪贴板不可用则走下载
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kosx-energy-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const fanCount = fan.length;
  const avgKol = fan.length ? fan.reduce((s, f) => s + f.pctFollowers10k, 0) / fan.length : 0;
  const avgVerified = fan.length ? fan.reduce((s, f) => s + f.verifiedPct, 0) / fan.length : 0;
  const totalSample = fan.reduce((s, f) => s + f.sampleSize, 0);
  const influenceTop = [...stats.members]
    .filter((m) => m.influence != null)
    .sort((a, b) => (b.influence?.score ?? -1) - (a.influence?.score ?? -1))
    .slice(0, 5);
  const mentionTop = [...stats.members]
    .filter((m) => (m.mentionCount30d ?? 0) > 0)
    .sort((a, b) => (b.mentionCount30d ?? 0) - (a.mentionCount30d ?? 0))
    .slice(0, 5);
  const maxTrack = Math.max(...stats.trackStats.map((t) => t.memberCount), 1);

  return (
    <>
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">社群能量报告</h1>
            <button
              type="button"
              onClick={() => void exportReport()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-soft-surface px-4 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
            >
              <Download className="size-4" /> 导出摘要
            </button>
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

        {/* 赛道分布 */}
        <Reveal delay={0.08}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">赛道分布</h2>
            <ul className="mt-5 space-y-3">
              {stats.trackStats
                .filter((t) => t.memberCount > 0)
                .sort((a, b) => b.memberCount - a.memberCount)
                .map((t) => (
                  <li key={t.slug}>
                    <Link to="/tracks/$slug" params={{ slug: t.slug }} className="block">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-mist tabular-nums">
                          {t.memberCount} 人 · {fmt(t.totalFollowers)} 粉
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/60">
                        <div className="h-full rounded-full bg-signal/70" style={{ width: `${(t.memberCount / maxTrack) * 100}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </Reveal>

        {/* 粉丝质量：画像聚合 */}
        <Reveal delay={0.1}>
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold">粉丝质量</h2>
            {fanCount === 0 ? (
              <p className="mt-4 text-mist">粉丝画像采样进行中。</p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="已采样画像" value={fanCount} />
                <StatCard label="样本总量" value={totalSample} />
                <StatCard label="平均 KOL 浓度" value={Math.round(avgKol)} suffix="%" highlight />
                <StatCard label="平均认证率" value={Math.round(avgVerified)} suffix="%" />
              </div>
            )}
          </section>
        </Reveal>

        {/* 影响力与声量 Top */}
        <Reveal delay={0.12}>
          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">影响力 Top</h2>
              <ul className="mt-4 space-y-2.5">
                {influenceTop.map((m, i) => (
                  <li key={m.id}>
                    <Link to="/members/$id" params={{ id: m.id }} className="flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-3 py-2.5 transition-colors hover:border-signal/40">
                      <span className="w-5 shrink-0 text-center font-bold text-mist tabular-nums">{i + 1}</span>
                      <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 text-xl font-extrabold tabular-nums">{m.influence?.score ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">被提及 Top</h2>
              <ul className="mt-4 space-y-2.5">
                {mentionTop.map((m, i) => (
                  <li key={m.id}>
                    <Link to="/members/$id" params={{ id: m.id }} className="flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-3 py-2.5 transition-colors hover:border-signal/40">
                      <span className="w-5 shrink-0 text-center font-bold text-mist tabular-nums">{i + 1}</span>
                      <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 font-bold text-signal tabular-nums">{m.mentionCount30d ?? 0} 次</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </Reveal>

        {/* 邀请裂变荣誉榜：谁带来了最多新成员 */}
        {inviteLeaders.length > 0 && (
          <Reveal delay={0.13}>
            <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-bold">推荐荣誉榜</h2>
              <ul className="mt-4 space-y-2.5">
                {inviteLeaders.map((m, i) => (
                  <li key={m.inviterId}>
                    <Link to="/members/$id" params={{ id: m.inviterId }} className="flex items-center gap-3 rounded-xl border border-line bg-soft-surface px-3 py-2.5 transition-colors hover:border-signal/40">
                      <span className="w-5 shrink-0 text-center font-bold text-mist tabular-nums">{i + 1}</span>
                      <Avatar url={m.profileImage} name={m.displayName ?? m.handle} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName ?? m.handle}</span>
                      <span className="shrink-0 font-bold text-signal tabular-nums">{m.n} 位新成员</span>
                    </Link>
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

