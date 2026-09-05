import type { ReactNode } from "react";
import { Link, Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
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
      { rel: "icon", href: "/og.svg", type: "image/svg+xml" },
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
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Outlet />
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
        <h1 className="text-3xl font-bold">
          页面不存在

        </h1>
        <p className="mt-4">
          <Link to="/" className="text-mist underline-offset-4 hover:text-ink hover:underline">
            ← 返回看板
          </Link>
        </p>
      </div>
    </>
  );
}

export const siteUrl = SITE_URL;

export type { ReactNode };