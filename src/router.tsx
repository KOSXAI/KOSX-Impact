import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // 智能预加载：鼠标悬停链接 50ms 自动预拉取路由代码与数据，实现 0 毫秒秒开
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
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