// scripts/_lib.mjs — 本地脚本共享工具层：SocialData key 读取、节流 fetch、SQL 转义、
// cache_bust 语句、wrangler d1 查询包装。只给 scripts/ 用，Worker 侧有各自实现，勿反向依赖。
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * SocialData API key：环境变量优先，.dev.vars 兜底。
 * （历史上脚本有两套互不兼容的解析正则，统一到这里。）
 * @returns {string | null}
 */
export function readSocialDataKey() {
  const env = process.env.SOCIALDATA_API_KEY;
  if (env) return env;
  const devVarsPath = resolve(ROOT, ".dev.vars");
  const devVars = existsSync(devVarsPath) ? readFileSync(devVarsPath, "utf-8") : "";
  return devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim() ?? null;
}

export const API_BASE = "https://api.socialdata.tools";

/**
 * 节流 GET（SocialData）：固定间隔串行，只防误触共享限流，不省成本。
 * 非 2xx 抛错并带响应体前 200 字符，便于定位。
 * @param {string} apiKey
 * @param {number} [intervalMs=650]
 */
export function createThrottledGet(apiKey, intervalMs = 650) {
  let lastAt = 0;
  return async function get(path) {
    const wait = lastAt + intervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  };
}

/** SQL 字面量：null → NULL，单引号翻倍 */
export const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/** 数据写库后 cache_bust +1：读端点缓存键换新，各数据中心立即可见 */
export const BUMP_CACHE_BUST_SQL = `INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`;

/** wrangler d1 --remote --json 查询，返回扁平化的 results 数组 */
export function d1Query(command) {
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command ${JSON.stringify(command)}`,
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024 }
  );
  return JSON.parse(out).flatMap((r) => r.results ?? []);
}
