# scripts/ 脚本索引

每个脚本的用途与触发方式。共同约定：多数脚本输出 `/tmp/*.sql` 或 JSON 产物，
配合 `wrangler d1 execute kosx-impact --remote --file=<sql>` 灌库；同步类脚本写库后
自动 bump `cache_bust`。一次性回填脚本用完即可删（git 历史可找回），按需新写。

## 定时自动化

| 脚本 | 用途 | 触发 |
| --- | --- | --- |
| `run-mentions.mjs` | 站外提及拉取（SocialData Search 按关键词），输出原始 JSON 供 agent 分析（去噪+情绪）后 SQL 入库 | 自动化 cron，每日 09:00 |
| `sync-community-signals.mjs` | 共同关注 / 社群品味（手动回填版） | 日常由 Worker cron（`src/sync-signals.ts`，每日 09:30）自动跑；本脚本只在需要重跑历史数据时手动执行 |
| `sync-member-mentions.mjs` | 成员被提及（手动回填版） | 同上，日常由 Worker cron 接管 |

## 新成员入职 / 维护

| 脚本 | 用途 | 触发 |
| --- | --- | --- |
| `sync-new-members.mjs` | 名册新增成员入职：拉粉丝数 / 显示名 / 头像，生成 `/tmp/onboard.sql`（显示名回写名册） | 每次引入新成员**必须**跑（见 CONTRIBUTING） |
| `apply-tracks.mjs` | 赛道/标签分类 JSON 入库（校验白名单 + bump cache_bust），支持显式空数组清空分类 | 人工/agent 判断产出分类后手动执行 |
| `sync-posts.mjs` | 帖子活跃度手动补跑（已纳入每日采集，仅兜底） | 手动 |

## 数据同步（手动）

| 脚本 | 用途 | 触发 |
| --- | --- | --- |
| `sync-official-similar.mjs` | 官方相似账号端点同步 → similar_accounts | 手动 |
| `fetch-followers-sample.mjs` | 粉丝圈画像采样 → fan_profiles | 手动，月度低频 |
| `verify-similar.mjs` | 相似账号候选验证（profile 确认真实存在） | 手动，agent 分析流程一环 |
| `fetch-analyze-input.mjs` | agent 分析素材拉取（纯库读，零 API） | 手动，agent 分析流程一环 |

## 构建 / 校验

| 脚本 | 用途 | 触发 |
| --- | --- | --- |
| `validate-members.mjs` | 校验 `data/members.json` 结构与唯一性 | `npm run check`（本地 + CI） |
| `build-og-fonts.mjs` | 生成 OG 卡中文子集字体 → `public/fonts/`（产物需提交） | 字体升级时手动重跑 |
