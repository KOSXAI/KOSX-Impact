import { useRef, useState } from "react";
import { Dialog, DialogCloseX, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/member/Avatar";
import { TierBadge } from "@/components/member/TierBadge";
import { fmt } from "@/lib/format";
import { titleOf } from "@/milestones";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { MemberStats } from "@/stats";
import { Check, Copy, Download } from "lucide-react";

/** X 品牌标：lucide 已移除品牌图标，内联 SVG（simple-icons 官方路径） */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

/** 分享文案模板：第一人称 + 段位/粉丝/下一道大关 + 档案链接（紧凑无空行，弹窗预览与复制内容一致） */
function shareLines(member: MemberStats, pageUrl: string): string[] {
  const name = member.displayName ?? member.handle;
  const stage =
    member.latestFollowers != null ? `（${fmt(member.latestFollowers)} 粉）` : "";
  return [
    `我已经参加了 ${SITE_NAME}！🎉`,
    `${name}（@${member.handle}）现在是「${member.tierName}」段位${stage}，正在冲击下一道大关「${titleOf(member.nextMilestone)}」！`,
    `来见证我的成长档案：${pageUrl}`,
  ];
}

type CopyKey = "text" | "link" | "image" | null;

/**
 * 分享弹窗：成员页横幅右上角分享钮打开。
 * 一键分享到 X（固定文案模板）/ 复制分享文案 / 复制主页链接 / OG 卡预览（复制或下载图片）。
 * 布局：紧凑单列——文案与卡片通栏，操作按钮两两成行，整弹窗控制在一屏内不滚动。
 */
export function ShareDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberStats;
}) {
  const [copied, setCopied] = useState<CopyKey>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgFail, setImgFail] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const name = member.displayName ?? member.handle;
  const pageUrl = `${SITE_URL}/members/${member.id}`;
  const ogUrl = `/og/members/${member.id}.png?v=2`;

  const lines = shareLines(member, pageUrl);
  const text = lines.join("\n");
  // 链接已含在文内，X 会自动识别成卡片
  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  function flash(key: Exclude<CopyKey, null>) {
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      flash("text");
    } catch {
      // 剪贴板被拒（权限/非安全上下文）：静默，用户可手动选中复制
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      flash("link");
    } catch {
      // 同上：静默
    }
  }

  async function copyImage() {
    if (imgBusy) return;
    setImgBusy(true);
    try {
      const blob = await fetch(ogUrl).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("image");
    } catch {
      // 浏览器不支持复制图片（如部分 Firefox）：提示走下载
      setImgFail(true);
      setTimeout(() => setImgFail(false), 2500);
    } finally {
      setImgBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 紧凑内边距 + 隐藏滚动条：正常窗口整卡可见，极小窗口静默滚动不出 bar */}
      <DialogContent className="gap-3 p-4 [scrollbar-width:none] sm:p-5 [&::-webkit-scrollbar]:hidden">
        <DialogCloseX />

        <div className="flex items-center gap-3.5 pr-8">
          <Avatar url={member.profileImage} name={name} className="size-12" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg">{name}</DialogTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-sm text-mist">@{member.handle}</span>
              <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
            </div>
          </div>
        </div>

        <Button asChild className="w-full">
          <a href={xHref} target="_blank" rel="noreferrer">
            <XLogo className="size-4" />
            分享到 X
          </a>
        </Button>

        {/* 分享文案：链接已含在文内，「复制文案 / 复制链接」两键并排收尾 */}
        <section className="min-w-0">
          <p className="rounded-xl border border-line bg-soft-surface p-4 text-sm leading-relaxed whitespace-pre-wrap break-words text-mist select-all">
            {text}
          </p>
          <div className="mt-2.5 flex gap-2.5">
            <ActionChip active={copied === "text"} label="复制文案" onClick={() => void copyText()} />
            <ActionChip active={copied === "link"} label="复制链接" onClick={() => void copyLink()} />
          </div>
        </section>

        {/* OG 卡片预览：分享到 X / 微信时展示的卡片，「复制图片 / 下载图片」两键并排 */}
        <section className="min-w-0">
          <img
            src={ogUrl}
            alt={`${name} 的 KOSX 影响力卡片`}
            loading="lazy"
            className="aspect-[1200/630] w-full rounded-xl border border-line object-cover"
          />
          <div className="mt-2.5 flex gap-2.5">
            <ActionChip active={copied === "image"} label="复制图片" onClick={() => void copyImage()} disabled={imgBusy} />
            <ActionChip asChild label="下载图片">
              <a href={ogUrl} download={`${member.handle}-kosx-impact.png`}>
                <Download className="size-3.5" />
                下载图片
              </a>
            </ActionChip>
          </div>
          {imgFail && <span className="mt-2 block text-xs text-mist">复制图片失败，请用下载</span>}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/** 弹窗内的并排操作小钮：flex-1 等宽对齐，成功短暂变勾 */
function ActionChip({
  active,
  label,
  onClick,
  asChild = false,
  disabled,
  children,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  asChild?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      onClick={onClick}
      asChild={asChild}
      disabled={disabled}
      aria-label={label}
    >
      {asChild ? (
        children
      ) : (
        <>
          {active ? <Check className="size-3.5 text-signal" /> : <Copy className="size-3.5" />}
          {active ? "已复制" : label}
        </>
      )}
    </Button>
  );
}
