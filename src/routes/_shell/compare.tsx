import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchDashboard, fetchMemberDetail } from "@/data.functions";
import type { MemberStats } from "@/stats";
import { Avatar } from "@/components/member/Avatar";
import { Reveal } from "@/components/motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, Users } from "lucide-react";
import { fmt } from "@/lib/format";
import { SITE_NAME, SITE_URL, xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * 成员对比 PK：任选两位成员同屏对比（粉丝/增长/影响力/内容效率/被提及），
 * 属于博主模块的第三层视图（URL 直达可分享）。
 */
export const Route = createFileRoute("/_shell/compare")({
  // a/b 只在非空时进 URL：缺省不回填空串，避免裸路径 /compare 307 成 /compare?a=&b=
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.a === "string" && search.a ? { a: search.a } : {}),
    ...(typeof search.b === "string" && search.b ? { b: search.b } : {}),
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
        { property: "og:description", content: "KOSX 成员数据同屏对比：粉丝、增长、影响力、内容效率与被提及热度。" },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/compare` },
        { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/site.png?v=2` },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/compare` }],
    };
  },
  component: ComparePage,
});

type Detail = NonNullable<ReturnType<typeof Route.useLoaderData>["left"]>;

function ComparePage() {
  const { members, left, right } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const [picking, setPicking] = useState<"a" | "b" | null>(null);

  const setSide = (slot: "a" | "b", id: string) =>
    navigate({ search: (p) => ({ ...p, [slot]: id }) });

  return (
    <div className="mx-auto max-w-5xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">成员对比</h1>
      </Reveal>

      {/* 两个可点的成员卡位 + VS 徽章：选人、换人都在卡片上完成 */}
      <Reveal delay={0.05}>
        <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-4">
          <PickerSlot member={left} onOpen={() => setPicking("a")} />
          <div className="flex items-center justify-center" aria-hidden="true">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-black text-mist">
              VS
            </span>
          </div>
          <PickerSlot member={right} onOpen={() => setPicking("b")} />
        </div>
      </Reveal>

      {left && right ? (
        <Reveal delay={0.08}>
          <div className="mt-8">
            <CompareTable left={left} right={right} />
          </div>
        </Reveal>
      ) : (
        <Reveal delay={0.08}>
          <div className="mt-8">
            <div className="text-sm font-semibold text-mist">热门对比</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {hotPairs(members).map(([a, b]) => (
                <button
                  key={`${a.id}-${b.id}`}
                  type="button"
                  onClick={() => navigate({ to: "/compare", search: { a: a.id, b: b.id } })}
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-surface px-3.5 text-sm font-semibold text-mist transition-colors hover:bg-wash-strong hover:text-ink"
                >
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    <Avatar url={a.profileImage} name={a.displayName ?? a.handle} className="size-5 ring-2 ring-surface" />
                    <Avatar url={b.profileImage} name={b.displayName ?? b.handle} className="size-5 ring-2 ring-surface" />
                  </span>
                  {a.displayName ?? a.handle}
                  <span className="font-black text-mist/60">vs</span>
                  {b.displayName ?? b.handle}
                </button>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      <MemberPickerDialog
        open={picking != null}
        onClose={() => setPicking(null)}
        members={members}
        excludeId={(picking === "a" ? right : left)?.member.id ?? null}
        onPick={(id) => {
          if (picking) setSide(picking, id);
          setPicking(null);
        }}
      />
    </div>
  );
}

/** 成员卡位：空 = 虚线占位可直接点选；已选 = 档案卡 + 更换按钮 */
function PickerSlot({ member, onOpen }: { member: Detail | null; onOpen: () => void }) {
  if (!member) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl bg-soft-surface p-5 text-mist transition-colors hover:bg-wash-strong hover:text-ink"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-surface" aria-hidden="true">
          <Users className="size-5" />
        </span>
        <span className="text-sm font-semibold">选择成员</span>
      </button>
    );
  }
  const name = member.member.displayName ?? member.member.handle;
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2.5 panel-card p-5 text-center">
      <Avatar url={member.member.profileImage} name={name} className="size-16" />
      <div className="min-w-0">
        <Link
          to="/members/$id"
          params={{ id: member.member.id }}
          className="block truncate font-bold text-ink underline-offset-4 hover:underline"
        >
          {name}
        </Link>
        <a
          href={xProfileUrl(member.member.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-mist hover:text-ink"
        >
          @{member.member.handle}
        </a>
        <div className="mt-1 text-xs font-semibold text-signal-ink tabular-nums">
          {fmt(member.member.latestFollowers ?? 0)} 粉丝
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-7 cursor-pointer items-center rounded-full bg-soft-surface px-3 text-xs font-semibold text-mist transition-colors hover:bg-wash-strong hover:text-ink"
      >
        更换
      </button>
    </div>
  );
}

function CompareTable({ left, right }: { left: Detail; right: Detail }) {
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
    <div className="overflow-hidden panel-card">
      {cols.map((row) => {
        const aWin = row.better === "high" && row.a > row.b;
        const bWin = row.better === "high" && row.b > row.a;
        return (
          <div key={row.label} className="grid grid-cols-3 items-center gap-2 border-t border-line px-5 py-3.5 first:border-t-0">
            <div className={cn("text-center text-lg font-bold tabular-nums", aWin && "text-signal-ink")}>
              {row.sign && row.a > 0 ? "+" : ""}{row.fmt ? fmt(row.a) : row.a}{row.suffix ?? ""}
            </div>
            <div className="text-center text-xs font-semibold text-mist">{row.label}</div>
            <div className={cn("text-center text-lg font-bold tabular-nums", bWin && "text-signal-ink")}>
              {row.sign && row.b > 0 ? "+" : ""}{row.fmt ? fmt(row.b) : row.b}{row.suffix ?? ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 空状态的快捷开始：粉丝量前三的两两组合 */
function hotPairs(members: MemberStats[]) {
  const top = [...members]
    .sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0))
    .slice(0, 3);
  const pairs: Array<[MemberStats, MemberStats]> = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) pairs.push([top[i], top[j]]);
  }
  return pairs;
}

function MemberPickerDialog({
  open,
  onClose,
  members,
  excludeId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberStats[];
  excludeId: string | null;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const q = query.trim().toLowerCase();
  const list = members
    .filter((m) => m.id !== excludeId)
    .filter((m) => !q || (m.displayName ?? m.handle).toLowerCase().includes(q) || m.handle.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">选择成员</DialogTitle>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Search className="size-5 shrink-0 text-mist" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索昵称或 @handle…"
            className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-mist/60"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-mist">没有匹配的成员</div>
          ) : (
            <div className="space-y-1">
              {list.map((m) => {
                const name = m.displayName ?? m.handle;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onPick(m.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-wash"
                  >
                    <Avatar url={m.profileImage} name={name} className="size-9 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                      <span className="block truncate text-xs text-mist">@{m.handle}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-mist tabular-nums">{fmt(m.latestFollowers ?? 0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
