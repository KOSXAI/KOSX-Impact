// 生成 src/routeTree.gen.ts。
//
// 为什么需要它：routeTree.gen.ts 是构建期生成物（.gitignore 里），本地由
// vite dev/build 的 tanstackStart 插件生成。干净 checkout（CI / 换机器）
// 上它不存在，`npm run typecheck` 会直接报
// "Cannot find module './routeTree.gen'" 而失败——这条隐藏依赖此前靠
// "开发机总有这个文件"掩着，直到接上 CI 才暴露。
//
// 走官方 programmatic API（@tanstack/router-generator），与 vite 插件同一套
// 生成逻辑；check 之前跑一次即可，不依赖 dev server 或完整 build。
//
// 末尾的 Register 声明块与 Start 插件的 route-tree-footer 同构（插件在
// 生成结果后追加，纯 generator 不带）：它给 `createFileRoute("/path")` 提供
// 路由路径的静态类型。缺了它 tsc 会报一片 "implicitly has an 'any' type"。
import { Generator, getConfig } from "@tanstack/router-generator";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = path.join(ROOT, "src", "routeTree.gen.ts");

const config = getConfig({}, ROOT);

// 先删旧文件：生成器会比对磁盘内容（存在且一致就跳过写入），
// 删掉后必定重写，避免"文件在但内容过期"的情况静默通过
await rm(generatedPath, { force: true });

const generator = new Generator({ config, root: ROOT });
await generator.run();

/** Start 插件追加的类型注册块（本仓库 routerFilePath = src/router.tsx，无 start 文件） */
const FOOTER = `
import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}`;

const generated = await readFile(generatedPath, "utf-8");
if (generated.includes("Awaited<ReturnType<typeof getRouter>>")) {
  console.log("✅ 路由树已生成（含 Start 注册块）：src/routeTree.gen.ts");
} else {
  await writeFile(generatedPath, `${generated.replace(/\s*$/, "")}\n${FOOTER}\n`, "utf-8");
  console.log("✅ 路由树已生成（已补 Start 注册块）：src/routeTree.gen.ts");
}
