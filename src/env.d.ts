// Worker Secrets 通过 `wrangler secret put` 注入，不写入 wrangler.jsonc，
// 因此需要在这里补充类型。本地开发时放入 .dev.vars。
interface Env {
  SOCIALDATA_API_KEY?: string;
}
