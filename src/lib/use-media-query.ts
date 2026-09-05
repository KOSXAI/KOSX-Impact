import { useEffect, useState } from "react";

/**
 * 响应式断点监听（图表坐标轴等 JS 侧适配用）。
 * 仅在客户端组件中使用（本项目图表都在 ClientOnly 懒加载内，无 SSR 顾虑）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
