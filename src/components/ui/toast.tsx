import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

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

export function Toaster() {
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handler = (t: ToastMessage) => {
      setCurrent(t);
      clearTimeout(timer);
      timer = setTimeout(() => setCurrent(null), 2800);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[110] flex justify-center px-4">
      {/* aria-live：复制成功等瞬态提示对读屏可见 */}
      <div role="status" aria-live="polite" className="contents">
      <AnimatePresence>
        {current && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/15 bg-surface/95 px-4 py-2 text-xs font-semibold text-ink shadow-[0_12px_32px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          >
            <span className="size-2 rounded-full bg-signal shadow-[0_0_8px_var(--signal)] animate-pulse" />
            <span>{current.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
