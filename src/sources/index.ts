import { socialDataSource } from "./socialdata";
import type { FollowerSource } from "./types";

/** 根据环境配置选择数据源。目前只有 SocialData，未来可切换官方 API / 成员 OAuth。 */
export function getSource(env: Env): FollowerSource {
  const apiKey = env.SOCIALDATA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少 SOCIALDATA_API_KEY：本地开发放入 .dev.vars，线上用 `wrangler secret put SOCIALDATA_API_KEY`"
    );
  }
  return socialDataSource(apiKey);
}
