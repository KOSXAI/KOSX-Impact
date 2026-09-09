import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * 博主域归组：榜单（/leaderboard）、广场（/members）、赛道（/tracks）三页
 * 共享 MemberModuleHeader 三视图门牌。pathless 目录只做文件组织，不参与 URL；
 * 没有这个归组层也不影响路由，子页（members/$id、tracks/$slug）同样挂在这里。
 */
export const Route = createFileRoute("/_shell/_creators")({
  component: CreatorsLayout,
});

function CreatorsLayout() {
  return <Outlet />;
}
