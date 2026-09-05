/// <reference types="vite/client" />

declare module "*.css" {}

// Cloudflare vite 插件的 wasm 模块加载器（\.wasm\?module）
declare module "*?module" {
  const module: WebAssembly.Module;
  export default module;
}