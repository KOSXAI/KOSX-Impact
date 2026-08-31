// 测试专用 bindings（在 vitest.config.ts 的 miniflare.bindings 中定义）。
// Cloudflare.Env 通过声明合并扩展，与 wrangler types 生成的内容合并。
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    SOCIALDATA_API_KEY: string;
  }
}
