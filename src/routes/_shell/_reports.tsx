import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * 报告家族归组：能量报告（/report）、成员周报（/reports/$memberId）、
 * 社群日报（/daily）、年报（/annual）。
 * pathless 目录只做文件组织，不参与 URL——四个页面的线上路径保持原样。
 */
export const Route = createFileRoute("/_shell/_reports")({
  component: ReportsLayout,
});

function ReportsLayout() {
  return <Outlet />;
}
