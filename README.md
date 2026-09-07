<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/kosx-logo-white.png">
    <img alt="KOSX 万粉影响力计划" src="assets/kosx-logo-black.png" width="600">
  </picture>
</p>

<h1 align="center">KOSX 万粉影响力计划</h1>

<p align="center">
  记录每一位成员冲刺一个个称号大关的过程——看见每个人的成长，也看见整个社群正在产生多大的影响。
  <br>
  <a href="https://kosx.ai"><b>官网</b></a> ·
  <a href="https://impact.kosx.ai"><b>在线看板</b></a> ·
  <a href="https://impact.kosx.ai/about">数据口径</a>
</p>

<p align="center">
  <a href="https://kosx.ai"><img src="https://img.shields.io/badge/官网-kosx.ai-0a0a0a?style=flat-square" alt="官网"></a>
  <a href="https://impact.kosx.ai"><img src="https://img.shields.io/badge/在线看板-impact.kosx.ai-ff6a00?style=flat-square" alt="在线看板"></a>
  <a href="https://impact.kosx.ai/about"><img src="https://img.shields.io/badge/数据口径-公开透明-ff6a00?style=flat-square" alt="数据口径"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/KOSXAI/KOSX-Impact?style=flat-square" alt="License"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome"></a>
  <img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1%20%2B%20Cron-f6821f?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare">
  <img src="https://img.shields.io/badge/TanStack%20Start-React%20SSR-ff4154?style=flat-square&logo=react&logoColor=white" alt="TanStack Start">
</p>

---

## 这是什么

KOSX 万粉影响力计划持续追踪和展示 KOSX 成员在 X 等公开平台上的成长数据——粉丝量、增长速度、称号大关、社群总影响力——把原本分散在每个人账号里的影响力，汇聚成一张属于 KOSX 的可视化网络。

它既是一块公开的数据看板，也是一场社群共同成长的游戏：

- **看见自己**：每天更新你的成长曲线，记录从加入到今天走过的每一步
- **看见彼此**：总排行、成长榜、登阶记录，让彼此的进步互相照亮
- **看见社群**：所有人的影响力加在一起，就是 KOSX 正在产生的影响

## 看板速览

下面这张图就是当前**真实数据**，每天都在更新：

<a href="https://impact.kosx.ai">
  <img src="https://impact.kosx.ai/og.svg" alt="KOSX 万粉影响力计划实时数据" width="600">
</a>

## 万粉影响力计划

第一阶段以 X 为核心：记录每一位成员从当前粉丝量一阶一阶往上登的过程。万粉不是终点，只是大关中的一道。

- **每日更新**，成长曲线完整保留，每一步都有迹可循
- **称号大关**：百粉、五百粉起步，千粉、五千粉各一道，万粉之后每 5000 一道直到三万，此后每整万一关到十万，再往上按量级放大；跨过一道领一个称号——「百里挑一」「五好青年」「千帆竞发」「学富五车」……万粉这道关就是本计划同名的「万人迷」，一直排到「十全十美」「亿鸣惊人」，个个都是好彩头，达成自动记一枚成就徽章
- **段位徽章**：新芽 → 千粉新秀 → 万粉达人 → 十万粉影响力 → 百万粉传奇 → 千万粉神话 → 亿级传说，只升不降
- **和自己比**：总排行看绝对影响力，成长榜看近期进步——小账号也有机会登顶

不一定非要有万粉的目标。任何一位想被看见、想和社群一起成长的成员，都欢迎加入。

## 如何加入

1. 打开 [impact.kosx.ai](https://impact.kosx.ai)，点「加入追踪」
2. 输入你的 X 主页链接（或 @ID），确认加入——不需要 GitHub 账号、不需要 PR、没有审批
3. 从当天起，你的成长曲线开始每天更新；弹窗里也可以随时手动刷新

想退出或删除数据？联系维护者即可，你的数据你做主。

## 数据与隐私

- **只追踪主动加入的成员**，加入即代表同意公开展示
- 追踪的数据全部来自账号的**公开信息**（粉丝量等），每日更新一次
- **随时可以退出**：停止采集、移除数据，你的数据你做主
- 数据来源与统计口径在站点「关于」页公开，保持透明

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Cloudflare Workers（全球边缘分发，免费额度内即可支撑当前量级） |
| 数据库 | Cloudflare D1（SQLite：成员 / 每日快照 / 登阶事件） |
| 数据采集 | Cron Trigger 每小时滚动，每日落一次真实数据 |
| 前端 | TanStack Start（React SSR，SEO 友好）+ Vite + Tailwind CSS 4 |
| API | Hono + TanStack Router server functions（Cache API 边缘缓存） |
| 可视化 | Recharts · Motion · shadcn/ui |
| 动态图 | SVG 进度卡 / OG 图运行时生成 |
| 测试 | Vitest（cloudflare:test） |

详细的架构说明与本地开发指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 仓库结构

```
.
├── .github/                  # Issue/PR 模板、CODEOWNERS、Dependabot
├── assets/                   # KOSX 品牌资源（README 用）
├── data/members.json         # 成员名册（通过 PR 修改）
├── migrations/               # D1 数据库迁移（SQL）
├── scripts/                  # 校验脚本
├── src/
│   ├── server.ts             # Worker 入口：API/SVG 卡 + SSR + cron
│   ├── api.ts                # Hono：JSON API / SVG 卡 / robots / sitemap
│   ├── queries.ts            # 共享查询层（含边缘缓存）
│   ├── collector.ts          # 数据采集（名册同步 + 快照）
│   ├── refresh-queue.ts      # 成员自助更新队列（CAS 节流）
│   ├── routes/               # React 页面（总览 / 榜单 / 赛道 / 内容 / 成员 / 关于）
│   ├── components/           # React 组件（shadcn/ui + 图表）
│   └── milestones.ts         # 称号大关与段位定义
├── test/                     # Vitest 测试
└── wrangler.jsonc            # Cloudflare 配置（Worker + D1 + Cron + Assets）
```

## 未来：X 平台影响力网络

影响力不只是粉丝数。全部数据收敛在 X 一个平台：声量监控、粉丝圈画像、相似账号推荐与赛道生态层层打通，最终形成一套属于 KOSX 的影响力网络。

## 当前进度

- [x] 数据底座：成员名册、每日快照与登阶事件
- [x] X 数据采集管线（SocialData 已接入，每日自动采集）
- [x] 模块化看板：顶部导航一页一模块（总览 / 榜单 / 赛道 / 内容 / 关于）——总排行 / 成长榜 / 影响力 / 登阶记录独立榜单页，称号大关与社群全景在总览 → **[impact.kosx.ai](https://impact.kosx.ai)**
- [x] 成员自助加入与自助更新：看板弹窗提交 X 主页即入队刷新，非成员可直接建追踪
- [x] 成员进度卡片（可嵌入个人主页）：`https://impact.kosx.ai/card/{成员id}.svg`
- [x] 帖子活跃度统计：成员页与内容页展示近 20 帖的浏览 / 赞 / 评论汇总 + 互动 Top（已纳入每日自动采集，全部成员覆盖）
- [x] 博主内容赛道与标签：五赛道（AI工具/财经/开发者/增长/出海）+ 综合兜底，赛道页 `/tracks` 赛道榜 + 成员页赛道 chip/标签组（Grok 逐个博主扫描打标，分类脚本入库）
- [x] 精华帖展示：独立页 `/posts` 全社群近 30 天单帖浏览 Top（含摘要 + 原文外链，SEO 收录）
- [x] 影响力指数与榜单升级：综合评分（0-1000，规模/增长/互动/产能四项）+ 有效粉丝量（粉丝量 × 质量系数），看板影响力榜 + 成员页四维分项
- [x] 内容洞察：互动率中位数 / 爆款识别 / 话题标签云 / 停更检测（内容页「内容洞察」区块 + 成员页爆款/停更标记）
- [x] 成员内容周报：`/reports/{成员id}` 近 7 天战绩（粉丝变化 / 称号进度 / 帖子 Top / 互动率 / 登阶）
- [x] KOSX 声量监控（站外提及）：Grok 定时搜索 X 上对 KOSX 的提及，总览页「品牌声量」区块
- [x] 粉丝圈画像与相似账号推荐：SocialData 粉丝样本聚合（KOL 浓度 / 认证率 / 活跃度）+ Grok 逐个扫描相似账号（成员页新区块）
- [x] 周报 / 月报分享卡（对外报告）：`/og/reports/{成员id}.png` 周报分享卡复用 OG 管线
- [x] 赛道周榜：赛道区块三重口径（存量粉丝 / 本周增长 / 帖子互动）
- [x] 赛道页 SEO 与邀请裂变：`/tracks/{赛道}` 独立页（SEO 收录 + 复制全部 @ 批量关注 + 赛道分享文案）
- [x] 创作者影响力网络（X 平台生态）：赛道页 / 声量 / 粉丝画像 / 相似推荐层层打通

## 参与贡献

这是一个公开的社区项目。

- **Bug 报告 / 功能建议 / 数据源建议**：仓库自带 Issue 模板，直接提 Issue
- **代码贡献**：架构、本地开发与部署说明见 [CONTRIBUTING.md](CONTRIBUTING.md)[^1]
- **加入追踪**：不需要 GitHub——直接在[看板](https://impact.kosx.ai)点「加入追踪」

[^1]: 成员名册通过 PR 修改，名册文件有 JSON Schema 校验与格式脚本，改完跑 `npm run check` 即可。

## License

[MIT](LICENSE) © KOSX