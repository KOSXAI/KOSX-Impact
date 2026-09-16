# scripts/ 脚本索引

每个脚本的用途与触发方式。共同约定：
- 多数脚本输出 `/tmp/*.sql` 或 JSON 产物，配合 `wrangler d1 execute kosx-impact --remote --file=<sql>` 灌库；
- 同步类脚本写库后自动 bump `cache_bust`；
- `_lib.mjs` 提供共享工具（API key 读取 / 节流 fetch / SQL 转义 / d1 查询包装 / 咨询锁），新脚本勿再各写一份；
- 同步脚本有失败项时以非零码退出，`&&` 链不会把半截数据灌进线上库。
一次性回填脚本用完即可删（git 历史可找回），按需新写。

## 发请求的脚本必须守的三条（`_lib.mjs` 已内置，勿绕开）

SocialData 的 120 req/min 是**账号级共享**的，且本机脚本与线上 Worker 用的是同一把 key：

1. **限流闸门全脚本共享**。用 `createThrottledGet(apiKey)`，不要自己写 `setTimeout` 循环：
   闸门是进程级单例（默认 850ms ≈ 70 req/min），留出的余量是给 Worker 侧的——
   429 落到 Worker 的刷新路径会触发它的全局熔断，整点采集直接停一小时。
2. **批量脚本先抢咨询锁**：`const lock = acquireScriptLock("脚本名")`，拿不到就退出并提示
   （`lock.holder` 是占用者）。锁落在 `site_meta`、带 TTL 兜底，`process.on("exit", () => lock.release())` 挂上即可。
3. **按 status 分流错误**，别把 402 当普通错误一口气跑完整个名册：
   `SocialDataError` 带 `status`；402/401/403 = 余额或鉴权问题，应**立即中止整个脚本**；
   429/5xx 由 `createThrottledGet` 内部退避重试；404 = handle 写错/账号注销，记下来别当通用失败吞掉。

另：SQL 一律经 `d1Query` / `d1Execute`（内部 `execFileSync` 传参数数组），
或写 `--file` 走 `lit()` 转义；**不要**用模板字符串拼 `wrangler d1 execute ... --command "..."`——
引号翻倍挡不住 `$` 与反引号被 shell 展开。

## 日常自动化（Worker cron，非本目录脚本）

成员被提及 + 社群信号（共同关注/品味）由 Worker cron（`src/sync-signals.ts`，每日 09:30）自动跑，见 wrangler.jsonc。

| 脚本 | 用途 | 触发 |
| --- | --- | --- |
| `run-mentions.mjs` | 品牌声量原始拉取（SocialData Search 按关键词），输出原始 JSON 供 agent 分析（去噪+情绪）后手工 SQL 入库 | 手动（agent 分析流程一环，无 cron） |
| `sync-community-signals.mjs` | 共同关注 / 社群品味（手动回填版） | 日常由 Worker cron 接管；仅在需要重跑历史数据时手动执行 |
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
| `validate-members.mjs` | 校验 `data/members.json` 结构与唯一性 | `npm run check`（本地；无 CI） |
| `build-og-fonts.mjs` | 生成 OG 卡中文子集字体 → `public/fonts/`（产物需提交） | 字体升级时手动重跑 |
| `smoke-pages.mjs` | CDP 逐页冒烟：无 console 错误 / 主内容真渲染 / 关键区块可见（9 页） | 改动动效·布局·懒加载后必跑；线上传 baseUrl 验收 |

`smoke-pages.mjs` 用法：`node scripts/smoke-pages.mjs [baseUrl]`（默认 `http://localhost:5173`）。
它只看**同源** 404 与真实 JS 异常——成员头像指向 pbs.twimg.com，作者换头像后旧 URL 404 与代码无关。
这是当前唯一能抓住「页面渲染回归」的关卡（SSR HTML 与 build 产物都看不出内容是否可见）。
