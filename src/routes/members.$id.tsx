import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GrowthChart } from "@/components/member/GrowthChart";
import { fmt, fmtDate, badge } from "@/lib/format";

export const Route = createFileRoute("/members/$id")({
  loader: async ({ params }) => {
    const detail = await fetchMemberDetail({ data: params.id });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => {
    const name = loaderData ? loaderData.member.displayName ?? loaderData.member.handle : "成员不存在";
    return {
      meta: [
        { title: `${name} · KOSX Impact` },
        { name: "description", content: `${name} 在 KOSX Impact 的成长档案：粉丝量曲线、目标进度与里程碑。` },
        { property: "og:title", content: `${name} · KOSX Impact` },
        { property: "og:description", content: "看见每个人的成长——这是 TA 在 Road to 10K 上的进度。" },
        { property: "og:type", content: "profile" },
        ...(loaderData
          ? [
              { property: "og:image", content: `https://10k.kosx.ai/card/${loaderData.member.id}.svg` },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `https://10k.kosx.ai/card/${loaderData.member.id}.svg` },
            ]
          : []),
      ],
    };
  },
  component: MemberPage,
  notFoundComponent: () => <MemberNotFound id="" />,
});

function MemberPage() {
  const { member, snapshots, milestones } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{member.displayName ?? member.handle}</h1>
        <span className="text-muted-foreground text-sm">@{member.handle}</span>
        <Link to="/" className="text-muted-foreground ml-auto text-sm underline-offset-4 hover:underline">
          ← 返回看板
        </Link>
      </header>

      <main className="mt-8 space-y-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="当前粉丝" value={fmt(member.latestFollowers ?? 0)} />
          <Stat label="累计增长" value={`${member.growth > 0 ? "+" : ""}${fmt(member.growth)}`} />
          <Stat label={`目标进度（${fmt(member.goal)}）`} value={`${member.progress}%`} />
          <Stat label="连续更新天数" value={String(member.streakDays)} />
        </section>

        <section>
          <h2 className="text-xl font-semibold">成长曲线</h2>
          <GrowthChart snapshots={snapshots} goal={member.goal} className="mt-3" />
        </section>

        <section>
          <h2 className="text-xl font-semibold">里程碑</h2>
          {milestones.length === 0 ? (
            <p className="text-muted-foreground mt-3">还没有里程碑，第一个 1K 正在路上。</p>
          ) : (
            <ul className="mt-2 divide-y">
              {milestones.map((m) => (
                <li key={m.threshold} className="flex items-center gap-3 py-2.5 text-sm">
                  <Badge variant="secondary" className="rounded-full font-semibold text-violet-600 dark:text-violet-400">
                    {badge(m.threshold)}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">{fmtDate(m.achievedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="text-muted-foreground mt-12 text-sm">
        加入于 {fmtDate(member.joinedAt)}
        {member.baselineFollowers !== null ? `，基线 ${fmt(member.baselineFollowers)} 粉丝` : ""}。数据每日更新一次。
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function MemberNotFound({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-destructive">成员不存在{id ? `（${id}）` : ""}。</p>
      <p className="mt-2">
        <Link to="/" className="underline-offset-4 hover:underline">← 返回看板</Link>
      </p>
    </div>
  );
}