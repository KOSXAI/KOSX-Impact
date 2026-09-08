import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";

export function TopLoadingBar() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      // 避免微小闪烁：仅当加载超过 60ms 时才显现
      timer = setTimeout(() => setVisible(true), 60);
    } else {
      setVisible(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="top-loading-bar"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 0.85, opacity: 1 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "0% 50%" }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] bg-gradient-to-r from-signal-warm via-signal to-signal shadow-[0_0_10px_var(--signal)]"
        />
      )}
    </AnimatePresence>
  );
}
