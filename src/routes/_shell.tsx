import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * 全站统一布局壳：SiteHeader 只在这里渲染一次，所有带页头的页面都经 _shell/ 目录挂载
 * （首页 / 榜单 / 广场 / 赛道 / 内容 / 报告家族 / 成员对比 / 关于）。
 * 顶栏之外的路由不进这个壳：OG 图片、未匹配路径的 404 兜底（在 __root）。
 */
export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  );
}
