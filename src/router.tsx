import { createRouter } from "@tanstack/react-router";
import { DefaultError } from "@/components/DefaultError";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // loader / 渲染抛错时用中文错误页兜底，而非 TanStack 默认英文原始错误页
    defaultErrorComponent: DefaultError,
    // 智能预加载：鼠标悬停链接 50ms 自动预拉取路由代码与数据，实现 0 毫秒秒开
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // 数据按小时采集：路由级 2 分钟内复用已有 loader 结果，避免站内切换/悬停反复重拉 150KB+ dashboard
    defaultStaleTime: 120_000,
    defaultPreloadStaleTime: 120_000,
    // 页面切换走 View Transitions API（原生、零运行时）；不支持时自动回退为瞬时切换
    defaultViewTransition: {
      types: ({ fromLocation, toLocation }) => {
        const from = fromLocation?.pathname ?? "/";
        const to = toLocation.pathname;
        if (from === "/" && to.startsWith("/members")) return ["page-forward"];
        if (from.startsWith("/members") && to === "/") return ["page-back"];
        return ["page-fade"];
      },
    },
  });
  return router;
}
