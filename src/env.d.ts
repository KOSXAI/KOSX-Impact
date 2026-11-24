/// <reference types="vite/client" />

declare module "*.css" {}

// Cloudflare vite 插件的 wasm 模块加载器（\.wasm\?module）
declare module "*?module" {
  const module: WebAssembly.Module;
  export default module;
}
/** 构建号（vite.config.ts define 注入）：SSR HTML 缓存键用，发版即换键 */
declare const __BUILD_ID__: string;

/** 可选运维告警 Webhook（通过 wrangler secret put ALERT_WEBHOOK_URL 配置，缺省静默） */
interface Env {
  ALERT_WEBHOOK_URL?: string;
}
