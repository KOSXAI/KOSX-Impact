import { useEffect, useState } from "react";

type ToastType = "success" | "info";

interface ToastMessage {
  id: string;
  message: string;
  type?: ToastType;
}

const listeners = new Set<(toast: ToastMessage) => void>();

export const toast = {
  success: (msg: string) => {
    listeners.forEach((fn) => fn({ id: Math.random().toString(), message: msg, type: "success" }));
  },
  info: (msg: string) => {
    listeners.forEach((fn) => fn({ id: Math.random().toString(), message: msg, type: "info" }));
  },
};

/** 淡出时长：与下方 transition 类保持一致（卸载前的退场窗口） */
const LEAVE_MS = 180;

/**
 * 全局瞬态提示（纯 CSS 过渡）。
 * 刻意不用 motion：本组件挂在 root、每页都在首屏关键路径上，
 * 引 motion 会把整套动画运行时（~39KB gz）拖进 entry chunk。
 * 组件常驻挂载，靠 class 在「显示 / 退场 / 隐藏」三态间切换。
 */
export function Toaster() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let leaveTimer: NodeJS.Timeout;
    const handler = (t: ToastMessage) => {
      setCurrent(t);
      setLeaving(false);
      clearTimeout(timer);
      clearTimeout(leaveTimer);
      timer = setTimeout(() => {
        setLeaving(true);
        leaveTimer = setTimeout(() => setCurrent(null), LEAVE_MS);
      }, 2800);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      clearTimeout(timer);
      clearTimeout(leaveTimer);
    };
  }, []);

  const shown = current != null && !leaving;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[110] flex justify-center px-4">
      {/* aria-live：复制成功等瞬态提示对读屏可见 */}
      <div role="status" aria-live="polite" className="contents">
        <div
          className={
            "pointer-events-auto flex items-center gap-2.5 rounded-full border border-edge bg-surface/95 px-4 py-2 text-xs font-semibold text-ink shadow-[var(--shadow-pop-xl)] backdrop-blur-xl " +
            "transition-[opacity,transform] duration-200 ease-out " +
            (shown ? "translate-y-0 scale-100 opacity-100" : "-translate-y-4 scale-95 opacity-0")
          }
        >
          <span className="size-2 rounded-full bg-signal shadow-[0_0_8px_var(--signal)] animate-pulse" />
          <span>{current?.message ?? ""}</span>
        </div>
      </div>
    </div>
  );
}
