import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * /members 布局：成员广场（members.index.tsx）与成员档案页（members.$id.tsx）共用的外壳。
 * 子路由内容经由 <Outlet/> 渲染——缺了它子路由会被静默丢弃（2026-09-08 修复）。
 */
export const Route = createFileRoute("/members")({
  component: MembersLayout,
});

function MembersLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  );
}