import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { fmt } from "@/lib/format";
import { SITE_NAME, GITHUB_APPLY_URL, xProfileUrl } from "@/lib/site";
import { ArrowUpRight, CircleCheck, Clock3, RefreshCw, SearchCheck } from "lucide-react";

export const Route = createFileRoute("/submit")({
  // 支持 /submit?handle=xxx 预填（成员详情页「这是你的账号？」入口）
  // 返回可选字段（handle?: string），否则 Link to="/submit" 会被类型系统要求必传 search
  validateSearch: (search: Record<string, unknown>) => {
    const out: { handle?: string } = {};
    if (typeof search.handle === "string") out.handle = search.handle;
    return out;
  },
  head: () => ({
    meta: [
      { title: `更新我的数据 · ${SITE_NAME}` },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "成员自助更新：提交你的 X 主页链接或用户名，立即刷新看板上的粉丝数据。",
      },
    ],
  }),
  component: SubmitPage,
});

type LookupPreview = {
  id: string;
  handle: string;
  displayName: string | null;
  profileImage: string | null;
  latestFollowers: number | null;
  latestRecordedAt: string | null;
  tierKey: string;
  tierName: string;
  nextTier: number;
  pending: boolean;
  lastProcessedAt: string | null;
};

type SubmitResult =
  | { status: "done"; followersAfter: number | null }
  | { status: "queued" }
  | { status: "throttled" };

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "preview"; member: LookupPreview }
  | { kind: "submitting"; member: LookupPreview }
  | { kind: "done"; member: LookupPreview; result: Extract<SubmitResult, { status: "done" }> }
  | { kind: "queued"; member: LookupPreview; result: Extract<SubmitResult, { status: "queued" | "throttled" }> }
  | { kind: "not_member"; handle: string }
  | { kind: "error"; message: string };

function SubmitPage() {
  const initialHandle = Route.useSearch().handle ?? "";
  const [input, setInput] = useState(initialHandle);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // 从成员页带 handle 进来时自动查询，直接落到预览态
  useEffect(() => {
    if (initialHandle) void lookup(initialHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(raw: string) {
    if (!raw.trim()) return;
    setPhase({ kind: "looking" });
    try {
      const res = await fetch(`/api/refresh/lookup?handle=${encodeURIComponent(raw)}`);
      if (res.ok) {
        const member = (await res.json()) as LookupPreview;
        setPhase({ kind: "preview", member });
      } else if (res.status === 404) {
        setPhase({ kind: "not_member", handle: raw.trim() });
      } else if (res.status === 400) {
        setPhase({ kind: "error", message: "这个输入不像有效的 X 用户名或主页链接，再检查一下？" });
      } else {
        setPhase({ kind: "error", message: "查询出了点问题，稍后再试一次。" });
      }
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试一次。" });
    }
  }

  async function submit(member: LookupPreview) {
    setPhase({ kind: "submitting", member });
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: member.handle }),
      });
      if (!res.ok) {
        setPhase({ kind: "error", message: "提交出了点问题，稍后再试一次。" });
        return;
      }
      const result = (await res.json()) as SubmitResult;
      if (result.status === "done") {
        setPhase({ kind: "done", member, result });
      } else {
        setPhase({ kind: "queued", member, result });
      }
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试一次。" });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">更新我的数据</h1>
        <p className="mt-4 leading-relaxed text-mist">
          看板每天自动更新一次（北京时间上午八点左右）。刚跨过新台阶、等不及明天？在这里提交你的
          X 主页链接或用户名，站点会当场去 X 拉取公开数据，立即刷新你的曲线与徽章。
        </p>
      </Reveal>

      <Reveal y={12} className="mt-8">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴你的 X 主页链接，或直接输入用户名"
            aria-label="X 主页链接或用户名"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 text-sm text-ink placeholder:text-mist/60 focus:border-signal/50 focus:outline-none"
          />
          <Button type="submit" disabled={phase.kind === "looking" || !input.trim()}>
            <SearchCheck className="size-4" />
            {phase.kind === "looking" ? "查询中…" : "查询"}
          </Button>
        </form>
        <p className="mt-3 text-sm text-mist/70">只接受公开信息，提交不需要登录，也不会请求任何私密权限。</p>
      </Reveal>

      <div className="mt-8">
        {phase.kind === "looking" && (
          <Card className="card-lift">
            <CardContent className="flex items-center gap-3 p-6 text-mist">
              <RefreshCw className="size-4 animate-spin" />
              正在查找这个账号…
            </CardContent>
          </Card>
        )}

        {(phase.kind === "preview" || phase.kind === "submitting") && (
          <PreviewCard
            member={phase.member}
            submitting={phase.kind === "submitting"}
            onSubmit={() => void submit(phase.member)}
          />
        )}

        {phase.kind === "done" && <DonePanel member={phase.member} followersAfter={phase.result.followersAfter} />}
        {phase.kind === "queued" && <QueuedPanel member={phase.member} throttled={phase.result.status === "throttled"} />}
        {phase.kind === "not_member" && <NotMemberPanel />}
        {phase.kind === "error" && <ErrorPanel message={phase.message} onBack={() => setPhase({ kind: "idle" })} />}
      </div>
    </div>
  );
}

/** 预览卡：确认这是你的账号，再触发更新 */
function PreviewCard({ member, submitting, onSubmit }: { member: LookupPreview; submitting: boolean; onSubmit: () => void }) {
  const name = member.displayName ?? member.handle;
  return (
    <Card className="card-lift">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <Avatar url={member.profileImage} name={name} className="size-14" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-lg font-bold">{name}</span>
              <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
            </div>
            <a
              href={xProfileUrl(member.handle)}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
            >
              @{member.handle}
            </a>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 text-sm text-mist">
          <span>
            当前粉丝 <b className="text-ink tabular-nums">{member.latestFollowers != null ? fmt(member.latestFollowers) : "—"}</b>
          </span>
          <span>
            上次更新 <span className="text-ink">{relativeTime(member.latestRecordedAt)}</span>
          </span>
          {member.pending && <Badge variant="secondary">已在更新队列中</Badge>}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={onSubmit} disabled={submitting || member.pending}>
            <RefreshCw className={submitting ? "size-4 animate-spin" : "size-4"} />
            {submitting ? "正在更新…" : member.pending ? "排队处理中" : "立即更新我的数据"}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/members/$id" params={{ id: member.id }}>
              查看我的成长档案
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DonePanel({ member, followersAfter }: { member: LookupPreview; followersAfter: number | null }) {
  return (
    <Card className="card-lift border-signal/40">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-6 text-signal" />
          <h2 className="text-xl font-bold">已更新</h2>
        </div>
        <p className="mt-3 text-mist">
          已从 X 拉取你的最新公开数据
          {followersAfter != null && (
            <>
              ：当前粉丝 <b className="text-ink tabular-nums">{fmt(followersAfter)}</b>
            </>
          )}
          。成长曲线、台阶与徽章已经是最新的了。
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/members/$id" params={{ id: member.id }}>
              查看我的成长档案
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QueuedPanel({ member, throttled }: { member: LookupPreview; throttled: boolean }) {
  return (
    <Card className="card-lift">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Clock3 className="size-6 text-mist" />
          <h2 className="text-xl font-bold">{throttled ? "刚刚提交过" : "已加入更新队列"}</h2>
        </div>
        <p className="mt-3 text-mist">
          {throttled
            ? "一分钟内已提交过一次，稍等片刻再点即可。"
            : "当前时刻的更新额度已用完，你的请求已排在队列里，几分钟到一小时内自动完成——之后刷新成员页就能看到新数据。"}
        </p>
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link to="/members/$id" params={{ id: member.id }}>
              查看我的成长档案
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotMemberPanel() {
  return (
    <Card className="card-lift">
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-xl font-bold">这个账号还没有加入追踪</h2>
        <p className="mt-3 text-mist">
          看板只追踪主动加入的成员。想让你的成长曲线出现在这里？填一份申请即可，全程约两分钟。
        </p>
        <div className="mt-6">
          <Button asChild>
            <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
              申请加入 <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorPanel({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <Card className="card-lift">
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-xl font-bold">查询遇到问题</h2>
        <p className="mt-3 text-mist">{message}</p>
        <div className="mt-6">
          <Button variant="outline" onClick={onBack}>
            重新输入
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** 相对时间：上次更新多久之前（中文口语） */
function relativeTime(iso: string | null): string {
  if (!iso) return "还没有数据";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
