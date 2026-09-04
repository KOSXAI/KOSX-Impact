import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion";
// 必须用全量入口 motion/react：mini 入口（motion/react-m）按特性裁剪，
// 不含 whileInView/IntersectionObserver 实现，视口入场动画会停在 initial（整页黑屏）
import { motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { fmt } from "@/lib/format";

/* ============ 动效 token：整个站点的风格都在这几行里调 ============ */

/** 张扬档入场缓动（ease-out-quint 系） */
export const easeOutQuint: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 带轻微过冲的 spring（横幅、弹入用） */
export const springPop = { type: "spring" as const, stiffness: 260, damping: 18 };

/* ============ SSR 安全入场：首帧渲染最终状态，hydration 后再补动画 ============ */

/**
 * hydration 前渲染普通元素（SSR/首帧内容完整可见，不伤 SEO/LCP）；
 * 挂载后换回 motion 元素，从 hidden 态动画到 final。换装只发生一帧内，
 * 视觉上先看见成稿、随后补一次轻入场，而不是长时间的空白。
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

/** 系统「减弱动态」偏好（SSR 安全）；为真时所有动效组件直接渲染静态内容 */
function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

const entranceViewport = { once: true, margin: "0px 0px -64px 0px" } as const;

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
  const hydrated = useHydrated();
  const reduced = useReducedMotionPreference();
  if (!hydrated || reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={entranceViewport}
      transition={{ duration: 0.5, ease: easeOutQuint, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ============ RevealGroup + RevealItem：列表/网格错峰入场 ============ */

export function RevealGroup({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const hydrated = useHydrated();
  const reduced = useReducedMotionPreference();
  if (!hydrated || reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={entranceViewport}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: 0.05 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  y = 20,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOutQuint } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** 惊喜元素弹入：spring 过冲（“刚刚达成”横幅这类） */
export function PopIn({ children, className }: { children: ReactNode; className?: string }) {
  const hydrated = useHydrated();
  const reduced = useReducedMotionPreference();
  if (!hydrated || reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springPop}
    >
      {children}
    </motion.div>
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
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (reduced) return;
    const controls = animate(0, value, {
      duration: 1.2,
      delay: 0.15,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo，张扬档滚动
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span className={className} aria-live="polite">
      {prefix}{fmt(display)}{suffix}
    </span>
  );
}

/* ============ GrowProgress：进度条生长（复用 Radix 自带 transition） ============ */

export function GrowProgress({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDisplay(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <Progress value={display} className={className} />;
}
