import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * 博主库归组：/members 一页多维表格式博主库（视图×筛选×布局，状态进 URL）。
 * /tracks/$slug 赛道详情页也挂在这里。pathless 目录只做文件组织，不参与 URL。
 */
export const Route = createFileRoute("/_shell/_creators")({
  component: CreatorsLayout,
});

function CreatorsLayout() {
  return <Outlet />;
}
