/**
 * 轻量运维告警通道（Webhook）：用于采集熔断（402/429）与定时任务异常通知。
 * - 未配置 env.ALERT_WEBHOOK_URL 时静默跳过（零外部依赖、测试无副作用）
 * - 基于 site_meta 做按 key 的冷却去重（默认 6 小时），避免每小时 cron 重复刷屏
 * - Payload 同时兼容飞书自定义机器人（msg_type/content.text）与 Slack/通用 Webhook（text）
 */
import { SITE_URL } from "./lib/site";
import { fetchWithTimeout } from "./sources/socialdata";

const DEFAULT_COOLDOWN_MS = 6 * 3_600_000;
const WEBHOOK_TIMEOUT_MS = 10_000;

export async function notifyAlert(
  env: Env,
  opts: { key: string; title: string; detail: string; cooldownMs?: number },
): Promise<boolean> {
  const url = env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;

  const metaKey = `alert_sent:${opts.key}`;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const nowIso = new Date().toISOString();

  try {
    // 原子冷却锁：冷却窗口内仅放行一次，防止并发或高频触发刷屏
    const claim = await env.DB.prepare(
      `INSERT INTO site_meta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = ?2
       WHERE (julianday(?2) - julianday(site_meta.value)) * 86400000 >= ?3`,
    )
      .bind(metaKey, nowIso, cooldownMs)
      .run();
    if ((claim.meta.changes ?? 0) === 0) return false;

    const text = `[KOSX Impact 告警] ${opts.title}\n${opts.detail}\n站点：${SITE_URL}\n时间：${nowIso}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text },
          text,
          title: opts.title,
          detail: opts.detail,
          site: SITE_URL,
          at: nowIso,
        }),
      },
      WEBHOOK_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.error(`[alert] Webhook 投递失败（HTTP ${res.status}）`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[alert] Webhook 异常：", error instanceof Error ? error.message : error);
    return false;
  }
}
