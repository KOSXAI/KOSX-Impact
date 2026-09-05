import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Dialog, DialogClose, DialogCloseX, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { fmt } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { CircleCheck, Clock3, RefreshCw, SearchCheck } from "lucide-react";

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

type SubmitResponse = {
  status: string;
  followersAfter: number | null;
  memberId: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "preview"; member: LookupPreview }
  | { kind: "submitting"; member: LookupPreview }
  | { kind: "join"; handle: string }
  | { kind: "joining"; handle: string }
  | { kind: "done"; memberId: string; followersAfter: number | null; joined: boolean }
  | { kind: "queued"; memberId: string; throttled: boolean; handle: string; submittedAt: string; joined: boolean }
  | { kind: "error"; message: string };

/** 排队轮询：每 10 秒查一次预览接口（读本地库，不耗采集额度），最长等 2 分钟 */
const POLL_INTERVAL_MS = 10_000;
const POLL_LIMIT = 12;

/**
 * 「加入追踪」弹窗：输入 X 主页链接或 @ID。
 * 在册成员 → 预览并立即更新数据；未在册 → 一键直接加入追踪（无审批流，提交即加入）。
 * 提交后若在队列等待（节流/拥堵），自动轮询直到生效并刷新看板数据。
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
  const router = useRouter();

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
        setPhase({ kind: "join", handle: raw.trim() });
      } else if (res.status === 400) {
        setPhase({ kind: "error", message: "这个输入不像有效的 @ID 或 X 主页链接。" });
      } else {
        setPhase({ kind: "error", message: "查询出了点问题，稍后再试。" });
      }
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试。" });
    }
  }

  /** 提交成功即刷新看板：数据已写库（cache_bust 换键），loader 重跑拿最新榜 */
  function refreshBoard() {
    void router.invalidate();
  }

  function applySubmitResponse(result: SubmitResponse, joined: boolean, handle: string) {
    if (result.status === "done") {
      setPhase({ kind: "done", memberId: result.memberId, followersAfter: result.followersAfter, joined });
      refreshBoard();
    } else {
      setPhase({
        kind: "queued",
        memberId: result.memberId,
        throttled: result.status === "throttled",
        handle,
        submittedAt: new Date().toISOString(),
        joined,
      });
    }
  }

  /** 队列被消费、新快照落地：转成功态并刷新看板 */
  function onQueuedResolved(memberId: string, followers: number | null, joined: boolean) {
    setPhase({ kind: "done", memberId, followersAfter: followers, joined });
    refreshBoard();
  }

  async function post(body: Record<string, unknown>): Promise<SubmitResponse | null> {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SubmitResponse;
  }

  async function submit(member: LookupPreview) {
    setPhase({ kind: "submitting", member });
    try {
      const result = await post({ input: member.handle });
      if (!result) {
        setPhase({ kind: "error", message: "提交出了点问题，稍后再试。" });
        return;
      }
      applySubmitResponse(result, false, member.handle);
    } catch {
      setPhase({ kind: "error", message: "网络不通，稍后再试。" });
    }
  }

  async function submitJoin(rawHandle: string) {
    setPhase({ kind: "joining", handle: rawHandle });
    try {
      const result = await post({ input: rawHandle, register: true });
      if (!result) {
        setPhase({ kind: "error", message: "提交出了点问题，稍后再试。" });
        return;
      }
      applySubmitResponse(result, true, rawHandle);
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
            <DialogTitle>加入追踪</DialogTitle>
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
                placeholder="例如 @yourname 或 x.com/yourname"
                aria-label="X 主页链接或 @ID"
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

        {(phase.kind === "join" || phase.kind === "joining") && (
          <JoinBody joining={phase.kind === "joining"} onJoin={() => void submitJoin(phase.handle)} />
        )}

        {phase.kind === "done" && (
          <DoneBody memberId={phase.memberId} followersAfter={phase.followersAfter} joined={phase.joined} />
        )}
        {phase.kind === "queued" && (
          <QueuedBody
            memberId={phase.memberId}
            throttled={phase.throttled}
            handle={phase.handle}
            submittedAt={phase.submittedAt}
            joined={phase.joined}
            onResolved={(followers) => onQueuedResolved(phase.memberId, followers, phase.joined)}
          />
        )}
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
        <Button onClick={onSubmit} disabled={submitting || member.pending} className="w-full sm:w-auto">
          <RefreshCw className={submitting ? "size-4 animate-spin" : "size-4"} />
          {submitting ? "正在更新" : member.pending ? "排队处理中" : "立即更新我的数据"}
        </Button>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link to="/members/$id" params={{ id: member.id }}>
            查看成长档案
          </Link>
        </Button>
      </div>
    </>
  );
}

/** 未在册：一键直接加入追踪 */
function JoinBody({ joining, onJoin }: { joining: boolean; onJoin: () => void }) {
  return (
    <>
      <DialogTitle>还没有加入追踪</DialogTitle>
      <div>
        <Button onClick={onJoin} disabled={joining} className="w-full sm:w-auto">
          <RefreshCw className={joining ? "size-4 animate-spin" : "size-4"} />
          {joining ? "正在加入" : "加入追踪"}
        </Button>
      </div>
    </>
  );
}

function DoneBody({ memberId, followersAfter, joined }: { memberId: string; followersAfter: number | null; joined: boolean }) {
  return (
    <>
      <DialogTitle className="flex items-center gap-2.5">
        <CircleCheck className="size-5 text-signal" />
        {joined ? "已加入追踪" : "已更新"}
      </DialogTitle>
      {followersAfter != null && (
        <div className="tabular-nums text-3xl font-bold">{fmt(followersAfter)}</div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="w-full sm:w-auto">
          <Link to="/members/$id" params={{ id: memberId }}>
            查看成长档案
          </Link>
        </Button>
      </div>
    </>
  );
}

/** 排队确认：自动轮询预览接口，任务完成即转成功态并刷新页面数据 */
function QueuedBody({
  memberId,
  throttled,
  handle,
  submittedAt,
  joined,
  onResolved,
}: {
  memberId: string;
  throttled: boolean;
  handle: string;
  submittedAt: string;
  joined: boolean;
  /** 队列已消费且新快照落地时回调（参数为最新粉丝数，可能为 null） */
  onResolved: (followers: number | null) => void;
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // 防抖命中（60 秒内重复提交）：任务已在处理中，无需轮询，稍后刷新即可
    if (throttled) return;
    let count = 0;
    const timer = setInterval(() => {
      count++;
      void (async () => {
        try {
          const res = await fetch(`/api/refresh/lookup?handle=${encodeURIComponent(handle)}`);
          if (!res.ok) return;
          const p = (await res.json()) as LookupPreview;
          // 队列已消费 && 快照晚于本次提交 → 生效
          if (!p.pending && p.latestRecordedAt && p.latestRecordedAt >= submittedAt) {
            clearInterval(timer);
            onResolved(p.latestFollowers);
          }
        } catch {
          // 单次轮询失败忽略，下一轮重试
        }
      })();
      if (count >= POLL_LIMIT) {
        clearInterval(timer);
        setTimedOut(true);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waiting = !throttled && !timedOut;
  return (
    <>
      <DialogTitle className="flex items-center gap-2.5">
        {waiting ? (
          <RefreshCw className="size-5 animate-spin text-signal" />
        ) : (
          <Clock3 className="size-5 text-mist" />
        )}
        {throttled ? "刚刚提交过" : timedOut ? "仍在排队" : "正在采集你的最新数据"}
      </DialogTitle>
      <p className="text-sm text-mist">
        {throttled
          ? "你刚刚提交过更新，它已经在处理中。无需重复点击，稍后刷新即可看到最新数据。"
          : timedOut
            ? "高峰期排队较长（或数据源限流）。任务会自动完成：最长 10 分钟内生效，稍后刷新即可看到你的排名。"
            : "已加入更新队列，完成后本窗口会自动回到成功状态（高峰期最长约 10 分钟）。"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link to="/members/$id" params={{ id: memberId }}>
            查看成长档案
          </Link>
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
        <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">
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
