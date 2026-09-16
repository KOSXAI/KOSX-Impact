import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * 顶部加载进度条（纯 CSS 过渡）。
 * 刻意不用 motion：本组件挂在 root、每页都在首屏关键路径上，
 * 引 motion 会把整套动画运行时（~39KB gz）拖进 entry chunk；
 * 这里只有 scaleX/opacity 两个属性，CSS transition 足够且无需等 hydration。
 * 三态：idle（隐藏）→ loading（走到 85%）→ done（补满淡出）→ idle。
 */
export function TopLoadingBar() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const showing = useRef(false);

  useEffect(() => {
    if (isLoading) {
      // 避免微小闪烁：仅当加载超过 60ms 时才显现
      const show = setTimeout(() => {
        showing.current = true;
        setPhase("loading");
      }, 60);
      return () => clearTimeout(show);
    }
    if (!showing.current) return;
    // 加载结束：进度条补满并淡出，动画走完再归位
    showing.current = false;
    setPhase("done");
    const reset = setTimeout(() => setPhase("idle"), 320);
    return () => clearTimeout(reset);
  }, [isLoading]);

  return (
    <div
      aria-hidden="true"
      style={{ transformOrigin: "0% 50%" }}
      className={
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] bg-gradient-to-r from-signal-warm via-signal to-signal shadow-[0_0_10px_var(--signal)] " +
        "transition-[transform,opacity] duration-300 ease-out " +
        (phase === "loading"
          ? "scale-x-[0.85] opacity-100"
          : phase === "done"
            ? "scale-x-100 opacity-0"
            : "scale-x-0 opacity-0")
      }
    />
  );
}
