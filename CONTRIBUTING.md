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
Cloudflare Worker + Cron Trigger（每天定时采集 X 数据）
        ↓ 写入
Cloudflare D1（SQLite：成员 / 每日快照 / 里程碑）
        ↓ 按日预渲染
静态页面 + JSON API → 全球 CDN 分发
```

- 数据一天更新一次，页面采用「定时采集 + 预渲染」，不做每次访问实时计算
- 全链路在 Cloudflare 免费额度内即可支撑当前量级，无服务器运维
- 数据源通过抽象层接入（当前：SocialData），未来可切换官方 API / 成员 OAuth 而不改业务逻辑
- 看板前端后续可迁移至 Cloudflare Pages / Workers Static Assets，API 保持不变

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
│   ├── index.ts              # Worker 入口（Hono 路由 + 定时任务）
│   ├── collector.ts          # 每日数据采集（名册同步 + 快照采集）
│   ├── roster.ts             # 名册同步逻辑
│   └── dashboard.ts          # 看板页面骨架
├── test/                     # Vitest 测试（基于 cloudflare:test）
├── wrangler.jsonc            # Cloudflare 配置（Worker + D1 + Cron）
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
| `npm run dev` | 本地启动 Worker |
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
- **成员加入流程**：审核「成员申请」Issue（确认同意声明已勾选）→ 在 `data/members.json` 中按 id 排序加入该成员（通过 PR 提交，CI 会校验格式）。合并并部署后，每日采集任务自动同步进 D1。
- **成员退出**：从名册中删除该成员（PR），同步后自动停止公开追踪、数据保留；如成员要求移除历史数据，删除其 `snapshots` / `milestones` 记录
- 数据库变更一律通过 `migrations/` 下的新迁移文件进行，不直接改线上库

## 沟通与行为规范

- 讨论对事不对人；尊重每一位成员的数据与隐私
- 不展示、不讨论任何成员未公开的信息
