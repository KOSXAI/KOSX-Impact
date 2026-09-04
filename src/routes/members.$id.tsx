import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchMemberDetail } from "@/data.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber, Reveal, RevealGroup, RevealItem } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { GrowthChart } from "@/components/member/GrowthChart";
import { fmt, fmtDate, badge } from "@/lib/format";
import { SITE_NAME, xProfileUrl } from "@/lib/site";

export const Route = createFileRoute("/members/$id")({
  loader: async ({ params }) => {
    const detail = await fetchMemberDetail({ data: params.id });
    if (!detail) throw notFound();
    return detail;
  },
  // 404 时 loaderData 为空：标题降级为「成员不存在」，并输出 noindex
  // 让搜索引擎丢弃软 404（SSR 状态码已是 HTTP 404，noindex 兜底防重复抓取）
  head: ({ loaderData }) => {
    const name = loaderData ? loaderData.member.displayName ?? loaderData.member.handle : "成员不存在";
    return {
      meta: [
        { title: `${name} · ${SITE_NAME}` },
        ...(loaderData
          ? [{ name: "description", content: `${name} 的成长档案：粉丝量曲线、目标进度与里程碑。` }]
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: `${name} · ${SITE_NAME}` },
        { property: "og:description", content: "看见每个人的成长——这是 TA 迈向万粉的进度。" },
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
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal className="flex flex-col gap-3" y={18}>
        <div className="flex items-center gap-4">
          <Avatar url={member.profileImage} name={member.displayName ?? member.handle} className="size-16" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{member.displayName ?? member.handle}</h1>
              <a
                href={xProfileUrl(member.handle)}
                target="_blank"
                rel="noreferrer"
                className="text-base text-mist underline-offset-4 hover:text-ink hover:underline"
              >
                @{member.handle}
              </a>
            </div>
            <p className="text-mist">
              加入于 {fmtDate(member.joinedAt)}
              {member.baselineFollowers !== null ? `，基线 ${fmt(member.baselineFollowers)} 粉丝` : ""}。
            </p>
          </div>
        </div>
        <Link to="/" className="text-mist underline-offset-4 hover:text-ink hover:underline">
          ← 返回看板
        </Link>
      </Reveal>

      <main className="mt-10 space-y-12 sm:mt-14">
        <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
          <RevealItem>
            <Stat label="当前粉丝" value={member.latestFollowers ?? 0} />
          </RevealItem>
          <RevealItem>
            <Stat label="累计增长" value={member.growth} prefix={member.growth > 0 ? "+" : ""} />
          </RevealItem>
          <RevealItem>
            <Stat label="目标进度" value={member.progress} suffix="%" />
          </RevealItem>
          <RevealItem>
            <Stat label="连续更新" value={member.streakDays} suffix=" 天" />
          </RevealItem>
        </RevealGroup>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">
              成长曲线

            </h2>
            <GrowthChart snapshots={snapshots} goal={member.goal} className="mt-6" />
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">
              里程碑

            </h2>
            {milestones.length === 0 ? (
              <p className="mt-4 text-mist">还没有里程碑，第一个千粉正在路上。</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {milestones.map((m) => (
                  <li key={m.threshold} className="flex items-center gap-3 py-3">
                    <Badge variant="secondary">{badge(m.threshold)}</Badge>
                    <span className="text-mist ml-auto">{fmtDate(m.achievedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Card className="card-lift h-full">
      <CardContent className="px-5 py-4">
        <div className="text-sm text-mist">{label}</div>
        <AnimatedNumber
          value={value}
          prefix={prefix}
          suffix={suffix}
          className="mt-1.5 block text-2xl font-bold tabular-nums"
        />
      </CardContent>
    </Card>
  );
}

function MemberNotFound({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <h1 className="text-3xl font-bold">
        成员不存在

      </h1>
      <p className="mt-4">
        <Link to="/" className="text-mist underline-offset-4 hover:text-ink hover:underline">
          ← 返回看板
        </Link>
      </p>
    </div>
  );
}
