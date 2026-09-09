import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fetchDashboard, fetchMemberDetail } from "@/data.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * 成员对比 PK：任选两位成员同屏对比（粉丝/增长/影响力/内容效率/被提及），
 * 属于博主模块的第三层视图（URL 直达可分享）。
 */
export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    a: typeof search.a === "string" ? search.a : "",
    b: typeof search.b === "string" ? search.b : "",
  }),
  loader: async ({ location }) => {
    const s = location.search as { a?: string; b?: string };
    const [all, left, right] = await Promise.all([
      fetchDashboard(),
      s.a ? fetchMemberDetail({ data: s.a }) : Promise.resolve(null),
      s.b ? fetchMemberDetail({ data: s.b }) : Promise.resolve(null),
    ]);
    return { members: all.members, left, right };
  },
  head: ({ loaderData }) => {
    const name = (d: { member: { displayName: string | null; handle: string } } | null | undefined) =>
      d ? (d.member.displayName ?? d.member.handle) : "";
    const title = loaderData?.left && loaderData?.right
      ? `${name(loaderData.left)} vs ${name(loaderData.right)} · ${SITE_NAME}`
      : `成员对比 · ${SITE_NAME}`;
    return {
      meta: [
        { title },
        { name: "description", content: "KOSX 成员数据同屏对比：粉丝、增长、影响力、内容效率与被提及热度。" },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/compare` },
      ],
    };
  },
  component: ComparePage,
});

function ComparePage() {
  const { members, left, right } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  if (!left || !right) {
    return (
      <>
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">成员对比</h1>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <MemberPicker label="成员 A" value={left?.member.id} onPick={(id) => navigate({ search: (p) => ({ ...p, a: id }) })} members={members} />
              <MemberPicker label="成员 B" value={right?.member.id} onPick={(id) => navigate({ search: (p) => ({ ...p, b: id }) })} members={members} />
            </div>
          </Reveal>
        </div>
      </>
    );
  }

  const cols = [
    { label: "当前粉丝", a: left.member.latestFollowers ?? 0, b: right.member.latestFollowers ?? 0, fmt: true, sign: false },
    { label: "近 7 天增长", a: left.member.growth7d, b: right.member.growth7d, fmt: true, sign: true, better: "high" },
    { label: "近 30 天增长", a: left.member.growth30d, b: right.member.growth30d, fmt: true, sign: true, better: "high" },
    { label: "影响力指数", a: left.influence?.score ?? 0, b: right.influence?.score ?? 0, fmt: false, better: "high" },
    { label: "有效粉丝", a: left.influence?.effectiveFollowers ?? 0, b: right.influence?.effectiveFollowers ?? 0, fmt: true, better: "high" },
    { label: "帖均曝光", a: Math.round(left.member.avgViewsPerPost ?? 0), b: Math.round(right.member.avgViewsPerPost ?? 0), fmt: true, better: "high" },
    { label: "发帖数(30天)", a: left.member.posts30d ?? 0, b: right.member.posts30d ?? 0, fmt: true, better: "high" },
    { label: "被提及(30天)", a: left.member.mentionCount30d ?? 0, b: right.member.mentionCount30d ?? 0, fmt: true, better: "high" },
    { label: "登阶成就", a: left.milestones.length, b: right.milestones.length, fmt: true, better: "high" },
    { label: "称号进度", a: left.member.progressToNext, b: right.member.progressToNext, fmt: false, better: "high", suffix: "%" },
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">成员对比</h1>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <MemberHead m={left} />
            <MemberHead m={right} />
            <div className="col-span-2 flex items-center gap-2">
              <select
                value={left.member.id}
                onChange={(e) => navigate({ search: (p) => ({ ...p, a: e.target.value }) })}
                className="h-9 flex-1 rounded-full border border-line bg-soft-surface px-3 text-sm font-semibold text-mist"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName ?? m.handle}</option>
                ))}
              </select>
              <span className="text-mist">VS</span>
              <select
                value={right.member.id}
                onChange={(e) => navigate({ search: (p) => ({ ...p, b: e.target.value }) })}
                className="h-9 flex-1 rounded-full border border-line bg-soft-surface px-3 text-sm font-semibold text-mist"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName ?? m.handle}</option>
                ))}
              </select>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
            {cols.map((row) => {
              const aWin = row.better === "high" && row.a > row.b;
              const bWin = row.better === "high" && row.b > row.a;
              return (
                <div key={row.label} className="grid grid-cols-3 items-center gap-2 border-t border-line px-5 py-3.5 first:border-t-0">
                  <div className={cn("text-center text-lg font-bold tabular-nums", aWin && "text-signal")}>
                    {row.sign && row.a > 0 ? "+" : ""}{row.fmt ? fmt(row.a) : row.a}{row.suffix ?? ""}
                  </div>
                  <div className="text-center text-xs font-semibold text-mist">{row.label}</div>
                  <div className={cn("text-center text-lg font-bold tabular-nums", bWin && "text-signal")}>
                    {row.sign && row.b > 0 ? "+" : ""}{row.fmt ? fmt(row.b) : row.b}{row.suffix ?? ""}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </>
  );
}

function MemberHead({ m }: { m: NonNullable<ReturnType<typeof Route.useLoaderData>["left"]> }) {
  const name = m.member.displayName ?? m.member.handle;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-5 text-center">
      <Avatar url={m.member.profileImage} name={name} className="size-16" />
      <div className="min-w-0">
        <div className="truncate font-bold">{name}</div>
        <a href={xProfileUrl(m.member.handle)} target="_blank" rel="noreferrer" className="text-sm text-mist hover:text-ink">
          @{m.member.handle}
        </a>
      </div>
      <Link to="/members/$id" params={{ id: m.member.id }} className="inline-flex h-8 items-center rounded-full border border-line bg-soft-surface px-4 text-xs font-semibold text-mist hover:text-ink">
        查看档案
      </Link>
    </div>
  );
}

function MemberPicker({ label, value, onPick, members }: { label: string; value?: string; onPick: (id: string) => void; members: Array<{ id: string; handle: string; displayName: string | null }> }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="text-sm font-semibold text-mist">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="mt-3 h-10 w-full rounded-full border border-line bg-soft-surface px-3 text-sm font-semibold"
      >
        <option value="">选择成员…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.displayName ?? m.handle}</option>
        ))}
      </select>
    </div>
  );
}