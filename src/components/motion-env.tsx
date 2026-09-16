import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * 动效环境（hydration 标记 + 系统「减弱动态」偏好）：全站单点订阅。
 *
 * 刻意独立成文件、且**不 import 任何 motion 运行时**：本 Provider 挂在 root，
 * 若与 motion/react 同文件，import Provider 就会把整套动画运行时（~39KB gz）
 * 拖进每页首屏的 entry chunk——那正是这里的拆分目的。
 * 动效组件（motion.tsx）从这里取状态，motion 运行时只在真正用到它的组件里加载。
 */
export type MotionEnv = { hydrated: boolean; reduced: boolean };

const MotionEnvContext = createContext<MotionEnv | null>(null);

/** Provider 缺席时的回退：按「已水化、无减弱偏好」处理（与 SSR 首帧行为一致） */
const SSR_SAFE_DEFAULT: MotionEnv = { hydrated: true, reduced: false };

export function MotionEnvironmentProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return <MotionEnvContext.Provider value={{ hydrated, reduced }}>{children}</MotionEnvContext.Provider>;
}

/** 读动效环境：Provider 缺席时取 SSR 安全默认值 */
export function useMotionEnv(): MotionEnv {
  return useContext(MotionEnvContext) ?? SSR_SAFE_DEFAULT;
}

/** 减弱动态偏好：无 Provider 时自己订阅（行为与旧实现一致） */
export function useReducedMotionPreference(): boolean {
  const ctx = useContext(MotionEnvContext);
  const [reduced, setReduced] = useState(false);
  const standalone = ctx == null;

  useEffect(() => {
    if (!standalone) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [standalone]);

  return standalone ? reduced : (ctx?.reduced ?? false);
}
