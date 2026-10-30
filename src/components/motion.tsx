import { useEffect, useRef, useState, type ReactNode } from "react";
// 只用 vanilla 的 motion（animate / inView / stagger）：不再依赖 motion/react 全量运行时，
// 否则它会因本文件被 _shell 引用而进入所有页面的公共 chunk（~131KB）
import { animate, inView, stagger } from "motion";
import { Progress } from "@/components/ui/progress";
import { fmt } from "@/lib/format";
import { prefersReducedMotionNow, useReducedMotionPreference } from "@/components/motion-env";

// 动效环境（hydration/减弱动态）在 motion-env.tsx：那里不引 motion 运行时，
// root 只 import Provider 就不会把动画运行时拖进首屏 chunk。这里再导出一次，
// 方便动效组件从单一入口取。
export { MotionEnvironmentProvider } from "@/components/motion-env";

/* ============ 动效 token：整个站点的风格都在这几行里调 ============ */

/** 张扬档入场缓动（ease-out-quint 系） */
export const easeOutQuint: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 带轻微过冲的 spring（横幅、弹入用） */
export const springPop = { type: "spring" as const, stiffness: 260, damping: 18 };

/** 进入视口前 64px 才触发，避免刚贴边就播完 */
const ENTRANCE_MARGIN = "0px 0px -64px 0px" as const;

/* ============ 入场动画的共用小工具（仅在 effect 内调用，SSR 安全） ============ */

/** 挂载时元素是否已在视口内（首屏内容保持 SSR 原样，不做入场动画） */
function isInViewportNow(el: Element): boolean {
  return el.getBoundingClientRect().top < window.innerHeight;
}

/** 瞬时设为入场起始态（透明 + 下移） */
function hide(el: HTMLElement, y: number) {
  el.style.opacity = "0";
  el.style.transform = `translateY(${y}px)`;
}

/** 清掉内联起始态：动画结束/卸载后不留 transform，避免干扰子元素 fixed 定位与 hover 变换 */
function clearHidden(el: HTMLElement) {
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
}

/* ============ Reveal：区块入场（进入视口一次） ============ */

export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPreference();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || prefersReducedMotionNow()) return;
    // 首屏已可见：保持 SSR 原样，不闪烁、不拖 LCP
    if (isInViewportNow(el)) return;

    hide(el, y);
    let controls: ReturnType<typeof animate> | undefined;
    const stopView = inView(
      el,
      () => {
        stopView(); // 只触发一次
        controls = animate(
          el,
          { opacity: 1, transform: "translateY(0px)" },
          { duration: 0.5, ease: easeOutQuint, delay },
        );
        controls.then(() => clearHidden(el));
      },
      { margin: ENTRANCE_MARGIN },
    );
    return () => {
      stopView();
      controls?.stop();
      clearHidden(el);
    };
  }, [reduced, delay, y]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ============ RevealGroup + RevealItem：列表/网格错峰入场 ============ */

export function RevealGroup({
  children,
  className,
  stagger: step = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPreference();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || prefersReducedMotionNow()) return;
    if (isInViewportNow(el)) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal-item]"));
    if (items.length === 0) return;

    // 每项的位移量由 RevealItem 写在 data-reveal-y 上
    for (const item of items) hide(item, Number(item.dataset.revealY ?? 20));
    let controls: ReturnType<typeof animate> | undefined;
    const stopView = inView(
      el,
      () => {
        stopView();
        controls = animate(
          items,
          { opacity: 1, transform: "translateY(0px)" },
          { duration: 0.4, ease: easeOutQuint, delay: stagger(step, { startDelay: 0.05 }) },
        );
        controls.then(() => items.forEach(clearHidden));
      },
      { margin: ENTRANCE_MARGIN },
    );
    return () => {
      stopView();
      controls?.stop();
      items.forEach(clearHidden);
    };
  }, [reduced, step]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function RevealItem({
  children,
  className,
  y = 20,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  /** 在 ol/ul 里用 "li"，保证 DOM 语义合法 */
  as?: "div" | "li";
}) {
  return (
    <Tag data-reveal-item="" data-reveal-y={y} className={className}>
      {children}
    </Tag>
  );
}

/** 惊喜元素弹入：spring 过冲（“刚刚达成”横幅这类） */
export function PopIn({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPreference();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || prefersReducedMotionNow()) return;
    const controls = animate(
      el,
      { opacity: [0, 1], y: [16, 0], scale: [0.92, 1] },
      springPop,
    );
    return () => controls.stop();
  }, [reduced]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ============ AnimatedNumber：数字滚动（SSR 渲染最终值，挂载后 0 → 目标） ============ */

export function AnimatedNumber({
  value,
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const reduced = useReducedMotionPreference();
  const [display, setDisplay] = useState(value);
  // 当前已显示的值：null = 还没滚过（首次挂载从 0 起），之后 value 变化从这里接着滚
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      shownRef.current = value;
      setDisplay(value);
      return;
    }
    const first = shownRef.current === null;
    const from = shownRef.current ?? 0;
    if (from === value) return;
    const controls = animate(from, value, {
      duration: first ? 1.2 : 0.8,
      delay: first ? 0.15 : 0,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo，张扬档滚动
      onUpdate: (v) => {
        const r = Math.round(v);
        shownRef.current = r;
        setDisplay(r);
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  // 滚动中的中间值对读屏无意义：可视文本 aria-hidden，另放一份最终值给读屏
  return (
    <span className={className}>
      <span aria-hidden="true">
        {prefix}{fmt(display)}{suffix}
      </span>
      <span className="sr-only">
        {prefix}{fmt(value)}{suffix}
      </span>
    </span>
  );
}

/* ============ GrowProgress：进度条生长（复用 Radix 自带 transition） ============ */

export function GrowProgress({
  value,
  className,
  ariaLabel,
}: {
  value: number;
  className?: string;
  /** 读屏可访问名称（进度条本身无可见文字，语义靠它传达） */
  ariaLabel?: string;
}) {
  const reduced = useReducedMotionPreference();
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const raf = requestAnimationFrame(() => setDisplay(value));
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  // 减弱动态：直接显示终值，不做生长
  return <Progress value={reduced ? value : display} className={className} aria-label={ariaLabel} />;
}
