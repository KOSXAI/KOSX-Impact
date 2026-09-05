import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogClose, DialogCloseX, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { fmt } from "@/lib/format";
import { GITHUB_APPLY_URL, xProfileUrl } from "@/lib/site";
import { ArrowUpRight, CircleCheck, Clock3, RefreshCw, SearchCheck } from "lucide-react";

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

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "preview"; member: LookupPreview }
  | { kind: "submitting"; member: LookupPreview }
  | { kind: "done"; member: LookupPreview; followersAfter: number | null }
  | { kind: "queued"; member: LookupPreview; throttled: boolean }
  | { kind: "not_member" }
  | { kind: "error"; message: string };

/**
 * 「提交申请」弹窗：输入 X 主页链接或用户名后的自助流程。
 * 成员 → 预览并立即更新数据；非成员 → 引导去 GitHub 申请。
 * 同一弹窗覆盖两种身份，替代独立页面。
 */
export function SubmitDialog({
  open,
  onOpenChange,
  defaultHandle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时预填并自动查询（成员页入口用） */
  defaultHandle?: string;
}) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // 每次打开重置；带 defaultHandle 时直接自动查询
  useEffect(() => {
    if (!open) return;
    setInput(defaultHandle ?? "");
    if (defaultHandle) void lookup(defaultHandle);
    else setPhase({ kind: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function lookup(raw: string) {
    if (!raw.trim()) return;
    setPhase({ kind: "looking" });
    try {
      const res = await fetch(`/api/refresh/lookup?handle=${encodeURIComponent(raw)}`);
      if (res.ok) {
        setPhase({ kind: "preview", member: (await res.json()) as LookupPreview });
      } else if (res.status === 404) {
        setPhase({ kind: "not_member" });
      } else if (res.status === 400) {
        setPhase({ kind: "error", message: "这个输入不像有效的 X 用户名或主页链接。" });
      } else {
        setPhase({ kind: "error", message: "查询出了点问题，稍后再试。" });
      }
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试。" });
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
        setPhase({ kind: "error", message: "提交出了点问题，稍后再试。" });
        return;
      }
      const result = (await res.json()) as { status: string; followersAfter?: number | null };
      if (result.status === "done") {
        setPhase({ kind: "done", member, followersAfter: result.followersAfter ?? null });
      } else {
        setPhase({ kind: "queued", member, throttled: result.status === "throttled" });
      }
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试。" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogCloseX />

        {(phase.kind === "idle" || phase.kind === "looking") && (
          <>
            <DialogTitle>提交申请</DialogTitle>
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
                placeholder="你的 X 主页链接或用户名"
                aria-label="X 主页链接或用户名"
                autoFocus
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-soft-surface px-5 text-sm text-ink placeholder:text-fog focus:border-signal/50 focus:outline-none"
              />
              <Button type="submit" disabled={phase.kind === "looking" || !input.trim()}>
                {phase.kind === "looking" ? <RefreshCw className="size-4 animate-spin" /> : <SearchCheck className="size-4" />}
                {phase.kind === "looking" ? "查询中" : "查询"}
              </Button>
            </form>
          </>
        )}

        {(phase.kind === "preview" || phase.kind === "submitting") && (
          <PreviewBody
            member={phase.member}
            submitting={phase.kind === "submitting"}
            onSubmit={() => void submit(phase.member)}
          />
        )}

        {phase.kind === "done" && <DoneBody member={phase.member} followersAfter={phase.followersAfter} />}
        {phase.kind === "queued" && <QueuedBody member={phase.member} throttled={phase.throttled} />}
        {phase.kind === "not_member" && <NotMemberBody />}
        {phase.kind === "error" && <ErrorBody message={phase.message} onBack={() => setPhase({ kind: "idle" })} />}
      </DialogContent>
    </Dialog>
  );
}

/** 预览：确认是自己的账号，再触发更新 */
function PreviewBody({ member, submitting, onSubmit }: { member: LookupPreview; submitting: boolean; onSubmit: () => void }) {
  const name = member.displayName ?? member.handle;
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar url={member.profileImage} name={name} className="size-14" />
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-lg">
            <span className="truncate">{name}</span>
            <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
          </DialogTitle>
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 text-sm text-mist">
        <span>
          当前粉丝 <b className="text-ink tabular-nums">{member.latestFollowers != null ? fmt(member.latestFollowers) : "—"}</b>
        </span>
        <span>
          上次更新 <span className="text-ink">{relativeTime(member.latestRecordedAt)}</span>
        </span>
        {member.pending && <Badge variant="secondary">已在队列</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSubmit} disabled={submitting || member.pending}>
          <RefreshCw className={submitting ? "size-4 animate-spin" : "size-4"} />
          {submitting ? "正在更新" : member.pending ? "排队处理中" : "立即更新我的数据"}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/members/$id" params={{ id: member.id }}>
            查看成长档案
          </Link>
        </Button>
      </div>
    </>
  );
}

function DoneBody({ member, followersAfter }: { member: LookupPreview; followersAfter: number | null }) {
  return (
    <>
      <DialogTitle className="flex items-center gap-2.5">
        <CircleCheck className="size-5 text-signal" />
        已更新
      </DialogTitle>
      {followersAfter != null && (
        <div className="tabular-nums text-3xl font-bold">{fmt(followersAfter)}</div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to="/members/$id" params={{ id: member.id }}>
            查看成长档案
          </Link>
        </Button>
      </div>
    </>
  );
}

function QueuedBody({ member, throttled }: { member: LookupPreview; throttled: boolean }) {
  return (
    <>
      <DialogTitle className="flex items-center gap-2.5">
        <Clock3 className="size-5 text-mist" />
        {throttled ? "刚刚提交过" : "已加入更新队列"}
      </DialogTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link to="/members/$id" params={{ id: member.id }}>
            查看成长档案
          </Link>
        </Button>
      </div>
    </>
  );
}

function NotMemberBody() {
  return (
    <>
      <DialogTitle>还没有加入追踪</DialogTitle>
      <div>
        <Button asChild>
          <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
            去 GitHub 提交申请 <ArrowUpRight className="size-4" />
          </a>
        </Button>
      </div>
    </>
  );
}

function ErrorBody({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <>
      <DialogTitle>查询遇到问题</DialogTitle>
      <p className="text-sm text-mist">{message}</p>
      <div>
        <Button variant="outline" onClick={onBack}>
          重新输入
        </Button>
      </div>
    </>
  );
}

/** 相对时间：上次更新多久之前 */
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
