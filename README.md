# KOSX Impact

> KOSX 社群的公开影响力数据平台：把分散在每个人账号里的影响力，汇聚成一张可视化的「KOSX 影响力网络」。

🚧 **当前状态**：仓库基座已就绪（数据模型 + API + 贡献机制），X 数据采集与可视化看板开发中。

## 这是什么

KOSX Impact 持续追踪和展示 KOSX 成员在 X 等公开平台上的成长数据，通过成员粉丝量、增长速度、里程碑、社群总影响力等指标，让原本分散在每个人账号里的影响力汇聚成一张可视化的「KOSX 影响力网络」。

它既是一块公开的数据看板，也是一场社群共同成长的游戏。

### 第一阶段：Road to 10K「万粉计划」

以 X 为核心，记录每一位成员从当前粉丝量走向 10,000 Followers 的过程：

- 每日更新数据
- 增长榜、里程碑、社群累计影响力
- 每位成员看到的是自己相对基线的进度，而不只是冷冰冰的排名

### 未来：Creator Influence Graph

继续接入 GitHub、YouTube、Newsletter、独立产品等数据，让「影响力」不再只等于粉丝数量，逐渐形成一套属于 KOSX 的 Creator Influence Graph——看见每个人的成长，也看见整个社群正在产生多大的影响。

## 技术架构

```
Cloudflare Worker + Cron Trigger（每天定时采集 X 数据）
        ↓ 写入
Cloudflare D1（SQLite：成员 / 每日快照 / 里程碑）
        ↓ 按日预渲染
静态页面 + JSON API → 全球 CDN 分发
```

- 数据一天更新一次，页面采用「定时采集 + 预渲染」，不做每次访问实时计算
- 全链路在 Cloudflare 免费额度内即可支撑当前量级，无服务器运维
- 看板前端后续可迁移至 Cloudflare Pages / Workers Static Assets，API 保持不变

## 仓库结构

```
.
├── .github/                  # CI/CD、Issue/PR 模板、CODEOWNERS、Dependabot
├── migrations/               # D1 数据库迁移（SQL）
├── src/
│   ├── index.ts              # Worker 入口（Hono 路由 + 定时任务）
│   ├── collector.ts          # 每日数据采集（当前为骨架）
│   └── dashboard.ts          # 看板页面骨架
├── test/                     # Vitest 测试（基于 cloudflare:test）
├── wrangler.jsonc            # Cloudflare 配置（Worker + D1 + Cron）
└── worker-configuration.d.ts # 由 wrangler types 生成，勿手改
```

## 本地开发

需要 Node ≥ 20，无需 Cloudflare 登录即可本地开发：

```bash
npm install
npm run db:migrate:local   # 首次或迁移变更后执行
npm run dev                # http://localhost:8787
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地启动 Worker |
| `npm run check` | typecheck + 测试（CI 同款检查） |
| `npm run cf-typegen` | 重新生成 `worker-configuration.d.ts` |
| `npm run db:migrate:local` | 应用 D1 迁移（本地） |

## 部署（Cloudflare）

一次性设置：

1. `npx wrangler login` 登录 Cloudflare 账号
2. `npm run db:create` 创建 D1 数据库，把输出的 `database_id` 填入 `wrangler.jsonc`
3. `npm run db:migrate:remote` 应用迁移
4. `npm run deploy` 部署 Worker（Cron Trigger 随 Worker 一起部署）
5. 可选：绑定自定义域名

GitHub Actions 自动部署：在仓库 Secrets 中配置 `CLOUDFLARE_API_TOKEN`（Workers 编辑权限）和 `CLOUDFLARE_ACCOUNT_ID`，之后 push 到 `main` 会自动应用迁移并部署。

## 数据与隐私

- **只追踪 opt-in 的成员**：成员通过「成员申请」Issue 主动加入，勾选同意声明后方可纳入
- **随时退出**：任何成员可以通过 Issue 申请退出，停止采集并可申请移除历史数据
- 追踪的数据全部来自账号的**公开信息**（粉丝量等），每日更新一次
- 数据来源与统计口径公布在站点「关于」页，保持透明

## 参与贡献

欢迎通过 Issue 和 PR 参与：

- 🐛 [Bug 报告](https://github.com/KOSXAI/KOSX-Impact/issues/new?template=bug-report.yml)
- 💡 [功能建议](https://github.com/KOSXAI/KOSX-Impact/issues/new?template=feature-request.yml)
- 🙋 [成员申请](https://github.com/KOSXAI/KOSX-Impact/issues/new?template=member-application.yml)
- 📊 [数据源建议](https://github.com/KOSXAI/KOSX-Impact/issues/new?template=data-source-proposal.yml)

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap

- [x] 仓库基座：Worker + D1 + GitHub 贡献机制
- [ ] Phase 1：X 数据采集（Road to 10K）
- [ ] 看板前端：增长榜 / 里程碑 / 社群总量
- [ ] 成员进度卡片（可嵌入个人主页）
- [ ] Phase 2：GitHub / YouTube / Newsletter 接入 → Creator Influence Graph

## License

[MIT](LICENSE)
