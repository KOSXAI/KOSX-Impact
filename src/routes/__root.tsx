import type { ReactNode } from "react";
import { Link, Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import "@/styles.css";

const SITE_URL = "https://10k.kosx.ai";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">页面不存在</h1>
      <p className="text-muted-foreground mt-2">你访问的页面不存在或已被移除。</p>
      <p className="mt-4">
        <Link to="/" className="underline-offset-4 hover:underline">← 返回看板</Link>
      </p>
    </div>
  );
}

export const siteUrl = SITE_URL;

export type { ReactNode };