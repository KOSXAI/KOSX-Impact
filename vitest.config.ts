import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // 在 Node 侧读取迁移文件，通过测试专用 binding 传给 Worker（setup 文件中应用）
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations")
  );

  return {
    plugins: [
      cloudflareTest({
        // 测试专用配置：main 指向纯 API 入口，绕开 TanStack SSR 的虚拟模块
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SOCIALDATA_API_KEY: "test-api-key",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
