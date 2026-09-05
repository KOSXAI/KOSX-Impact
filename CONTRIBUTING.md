# 贡献指南

感谢你对 KOSX Impact 的关注！这个项目既是公开数据平台，也是社区共同维护的仓库。你可以通过以下方式参与：

## 参与方式

| 方式 | 适合 | 入口 |
| --- | --- | --- |
| 代码贡献 | 功能、修复、文档 | Issue / PR |
| 申请加入追踪 | KOSX 成员 | 「成员申请」Issue |
| 建议新数据源 | 所有人 | 「数据源建议」Issue |
| 反馈与讨论 | 所有人 | Issue |

## 项目架构

```
Cloudflare Worker + Cron Trigger（每小时滚动采集 X 数据）
        ↓ 写入
Cloudflare D1（SQLite：成员 / 每日快照 / 里程碑）
        ↓ 读接口（Cache API 边缘缓存，采集后主动刷新）
React SSR 页面（TanStack Start）+ JSON API + SVG 嵌入卡 → 全球 CDN 分发
```

- 数据一天更新一次，页面为服务端渲染（SEO 友好），读接口走边缘缓存，不做每次访问实时计算
- 全链路在 Cloudflare 免费额度内即可支撑当前量级，无服务器运维
- 数据源通过抽象层接入（当前：SocialData），未来可切换官方 API / 成员 OAuth 而不改业务逻辑
- 成员自助更新（/submit 页面）：提交 handle 入队 → 抢到全局节流槽（CAS，≥21 秒间隔，守住
  SocialData 每分钟 3 次免费额度）当场处理，抢不到由 cron 兜底清空。消费复用与每日采集
  完全相同的写入管线（快照/登阶/日统计），管线里永远只有真实 API 数据。
  核心代码：`src/refresh-queue.ts`（入队/查询/节流槽）+ `src/collector.ts`（队列消费）

## 仓库结构

```
.
├── .github/                  # Issue/PR 模板、CODEOWNERS、Dependabot（无 GitHub Actions）
├── data/
│   ├── members.json          # 成员名册：追踪名单的事实来源（通过 PR 修改）
│   └── members.schema.json   # 名册的 JSON Schema
├── migrations/               # D1 数据库迁移（SQL）
├── scripts/                  # 校验脚本（名册格式等）
├── src/
│   ├── server.ts             # Worker 入口：API/SVG 卡分发 + TanStack SSR + cron
│   ├── api.ts                # Hono：JSON API / SVG 卡 / robots / sitemap
│   ├── queries.ts            # 共享查询层（API 与 SSR 共用，含边缘缓存）
│   ├── data.functions.ts     # TanStack server functions（路由 loader 取数）
│   ├── routes/               # React 页面（看板 / 成员详情 / 关于）
│   ├── components/           # React 组件（shadcn/ui + 图表）
│   ├── collector.ts          # 数据采集（名册同步 + 快照采集）
│   ├── roster.ts             # 名册同步逻辑
│   ├── stats.ts              # 统计计算（纯函数）
│   └── card.ts               # SVG 进度卡 / OG 图生成
├── test/                     # Vitest 测试（基于 cloudflare:test）
├── wrangler.jsonc            # Cloudflare 配置（Worker + D1 + Cron + Assets）
├── wrangler.test.jsonc       # 测试专用配置（轻量 API 入口，不含 SSR）
└── worker-configuration.d.ts # 由 wrangler types 生成，勿手改
```

## 成员名册

`data/members.json` 是追踪名单的**事实来源**，格式由同目录的 JSON Schema 定义，CI 会校验每次修改。每日采集任务把名册同步进 D1：

- 新成员在名册中加一行 → 下次同步自动开始追踪
- 成员退出 → 从名册中删除对应条目，自动停止公开追踪、历史数据保留
- `baselineFollowers` 是加入时的粉丝量，用于回填成长曲线的起点（冷启动）

加入方式：在「成员申请」Issue 中确认同意声明后，通过 PR 把成员加进名册。初始名单可以一次性批量加入。

## 本地开发

需要 Node ≥ 20，无需 Cloudflare 登录即可本地开发：

```bash
npm install
npm run db:migrate:local   # 首次或迁移变更后执行
npm run dev                # http://localhost:8787
```

需要真实数据源时，把密钥写进 `.dev.vars`（已被 .gitignore 忽略，模板见 `.dev.vars.example`）：

```
SOCIALDATA_API_KEY=你的key
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地启动（Vite + SSR），http://localhost:5173 |
| `npm run build` | 构建前端与 Worker 产物 |
| `npm run check` | 名册校验 + typecheck + 测试（提交前的本地检查，无远程 CI） |
| `npm run cf-typegen` | 重新生成 `worker-configuration.d.ts` |
| `npm run db:migrate:local` | 应用 D1 迁移（本地） |

## 部署（Cloudflare）

本地部署即可，**GitHub 侧不需要任何凭据**（不使用 GitHub Actions）：

一次性准备：

1. `npx wrangler login` 登录 Cloudflare 账号
2. `npm run db:create` 创建 D1 数据库，把输出的 `database_id` 填入 `wrangler.jsonc`
3. `npm run db:migrate:remote` 应用迁移
4. `npx wrangler secret put SOCIALDATA_API_KEY` 配置数据源密钥
5. 可选：绑定自定义域名

之后每次发布：

```bash
npm run check      # 本地检查：名册 + typecheck + 测试
npm run deploy     # 部署 Worker（Cron Trigger 随 Worker 一起部署）
git push           # 推送 GitHub
```

如日后想要「push 即自动部署」，可接入 Cloudflare 原生的 **Workers Builds**（控制台 Workers → Import a repository，通过 GitHub App 授权，不需要 GitHub secrets；部署命令需包含 `wrangler d1 migrations apply kosx-impact --remote && wrangler deploy`）。

## 提 Issue

- 使用对应模板：Bug 报告 / 功能建议 / 成员申请 / 数据源建议
- **成员申请必须勾选「公开追踪同意声明」**，这是数据合规的前提
- 报告数据问题时，请附上时间点和相关成员，便于定位

## 提 PR

1. Fork 本仓库，从 `main` 切出分支
2. 完成改动并在本地验证（`npm run check`）
3. 发起 PR，按模板填写说明并关联 Issue
4. 本地 `npm run check` 必须通过（仓库无远程 CI，验证以本地为准），维护者 review 后合并

数据相关的 PR 额外要求：

- 涉及数据采集 / 展示的变更，说明数据来源与更新口径
- 涉及成员个人数据的变更，需确认成员同意公开

## 维护者指引

- 开启 `main` 分支保护（本仓库无 GitHub Actions 状态检查，建议要求 review，或以本地 `npm run check` 验证结果为准）
- **成员加入流程**：审核「成员申请」Issue（确认同意声明已勾选）→ 在 `data/members.json` 中按 id 排序加入该成员（通过 PR 提交，CI 会校验格式）→ 本地跑 `node scripts/sync-new-members.mjs`（新成员会从 SocialData 拉取粉丝数、头像与 **X 显示名**；名下写回 `data/members.json`，随本 PR 一并提交，缺了它会退化成 handle）；执行生成的 `/tmp/onboard.sql` 入库。每次引入新成员时**必须**跑该脚本，避免 `displayName` 缺失。
- **成员退出**：从名册中删除该成员（PR），同步后自动停止公开追踪、数据保留；如成员要求移除历史数据，删除其 `snapshots` / `milestones` 记录
- 数据库变更一律通过 `migrations/` 下的新迁移文件进行，不直接改线上库

## 沟通与行为规范

- 讨论对事不对人；尊重每一位成员的数据与隐私
- 不展示、不讨论任何成员未公开的信息
