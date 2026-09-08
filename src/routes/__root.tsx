import type { ReactNode } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TopLoadingBar } from "@/components/TopLoadingBar";
import { Toaster } from "@/components/ui/toast";
import { SITE_URL } from "@/lib/site";
import "@/styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0a0a0a" },
    ],
    links: [
      // 官网 kosx.ai 同款 KOSX logo（白色 X 标，assets 与官网主题同一文件）
      { rel: "icon", href: "/kosx-icon.png", type: "image/png" },
    ],
  }),
  component: RootComponent,
  // 全局未匹配路径（/members/$id 之外的任意路径）的 404 兜底：
  // 保持与站点一致的视觉，子路由的 notFoundComponent 优先
  notFoundComponent: GlobalNotFound,
});

function RootComponent() {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <TopLoadingBar />
        <Toaster />
        {/* flex-1：内容不足一屏时页脚也贴底 */}
        <div className="flex-1">
          <Outlet />
        </div>
        <SiteFooter />
        <Scripts />
      </body>
    </html>
  );
}

function GlobalNotFound() {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <h1 className="text-3xl font-bold">页面不存在</h1>
      </div>
    </>
  );
}

export const siteUrl = SITE_URL;

export type { ReactNode };