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
├── scripts/                  # 同步/回填/校验脚本（逐个用途见 scripts/README.md）
├── src/
│   ├── server.ts             # Worker 入口：API/SVG 卡 + SSR + cron
│   ├── api.ts                # Hono：JSON API / SVG 卡 / robots / sitemap
│   ├── queries/              # 共享查询层（dashboard/member/community/archive 五模块，含边缘缓存）
│   ├── collector.ts          # 数据采集（名册同步 + 快照）
│   ├── refresh-queue.ts      # 成员自助更新队列（CAS 节流）
│   ├── routes/               # React 页面（总览 / 榜单 / 赛道 / 内容 / 成员 / 关于）
│   ├── components/           # React 组件（shadcn/ui + 图表）
│   └── milestones.ts         # 称号大关与段位定义
├── test/                     # Vitest 测试
└── wrangler.jsonc            # Cloudflare 配置（Worker + D1 + Cron + Assets）
```

## Roadmap：从数据看板，到影响力社区

看板已经跑通，接下来的目标，是把它升级成一座真正的影响力社区——每位成员被看见、想关注的人能找到值得关注的博主、KOSX 的能量被更多人看见。演进围绕五个方向展开，每个方向都能独立落地、独立上线，也欢迎社区一起参与。

### ① 看见当下 —— 让「谁在涨」讲到每一天

- [x] 社群日报 / 周报：每天自动生成一份社群战报（今日登阶、涨粉冠军、最爆内容、赛道表现、品牌声量），按日期归档、一键分享（/daily 已上线；周报已在线）
- [x] 今日曝光增量榜：帖子存 views_prev 上次数值，「今日曝光增量」= 近 24h 刷新差额，首页「今日动态」Top3（首日刷新后出数）
- [x] 多维时间榜：涨粉 / 曝光 / 发帖 / 评论 × 今日 / 近 7 天 / 近 30 天口径矩阵，榜单「成长」tab 内切换、全部进 URL 可分享可收录（?metric=views&range=7）
- [x] 新锐潜力榜：粉丝量不大但内容效率极高的潜力账号，分粉丝档展示，回答「现在该关注谁」
- [x] 最勤快博主榜：按周均发帖数排「最活跃的内容创作者」
- [x] 声量趋势与情绪分布：品牌声量卡 = 情绪分布条 + 近 14 天按日趋势迷你图
- [x] 全站历史 Top 帖：内容页「全站历史」tab，突破 30 天窗口的「社群最火」

### ② 看见彼此 —— 把成员连成一张网

- [x] 赛道内名次与同赛道伙伴：成员页亮出「所在赛道第几名」+ 同赛道 / 同标签账号（数据已在手，零成本）
- [x] 社群内部互推图谱：近 30 天帖子正文相互 @ 的关系边，首页「社群全景」下展示 Top 关系（影响力网络第一块真实数据）
- [x] 同粉丝圈博主：按粉丝样本重叠度推荐「真正同受众」的账号（成员详情「同粉丝圈」，采样重叠标注）
- [x] 共同关注与社群品味：SocialData following 采样聚合「成员们共同关注的大V」+ 帖子正文「社群热议」外部账号（community_signal_counts，每日 09:30 由 Cloudflare cron 自动刷新），内容页「社群品味」两栏策展
- [x] 相似推荐升级：SocialData 官方相似端点（/twitter/user/{id}/similar）同步入库，与既有语义相似互补（sync-official-similar.mjs，56 条已入库）
- [x] 关注与订阅：收藏成员（本地存储 + 广场「只看收藏」）与 RSS 更新源已上线；赛道/成员订阅提醒待补
- [x] 邀请裂变追踪：分享链接带 ?invite=成员id，新成员自助加入自动归因（invite_events 0019 + /api/invite），/report「推荐荣誉榜」展示谁带来最多新成员

### ③ 看见自己 —— 让成长更有仪式感

- [x] 爆款 → 涨粉归因：成员页「内容密码」显示「这条爆款带来 ≈N 粉」，把内容与成长连成故事
- [x] 最佳发帖时间：成员页「黄金时段」+ 内容页「社群黄金时段」均已上线（近 30 天小时桶平均曝光）
- [x] 内容形态配方：内容页「什么形态最吃香」（带链接 / 长文本 / 短文本平均曝光对比）
- [x] 争议帖识别：「最有讨论度」帖子视角已上线（成员页「内容密码」）
- [x] 下一位称号倒计时：冲线在即升级为「还差 N 粉 · 预计 X 天」
- [x] 成员对比 PK：/compare 任意两位成员同屏对比（粉丝/增长/影响力/内容效率/被提及），URL 直达可分享；成员详情「发起对比」入口
- [x] 年度影响力报告：/annual 上线——YTD 增长、月度总粉丝趋势、年度登阶、年度涨粉/声量/最火内容 Top（日报页入口）
- [x] 成长档案与回顾：成员页「成长档案」卡（加入天数 / 已领称号 / 当前段位 / 首次登阶，可分享成长卡）
- [x] 周冠军 / 月冠军：成长榜近 7 天视图顶部「本周王者」叙事（月冠军编排待补）
- [x] 影响力效率对比：同量级帖均曝光倍数徽章已上线（新锐榜 + 榜单行）

### ④ 看见价值 —— 让社群成为可展示的证据

- [x] 成员被提及榜：每位成员的「被讨论热度」新维度（榜单第六个榜上线，每日 09:30 由 Cloudflare cron 自动同步，src/sync-signals.ts）
- [x] 社群能量报告：/report 页上线——总影响力、赛道分布、粉丝质量聚合（KOL 浓度 / 认证率）、影响力与被提及 Top、推荐荣誉榜，一键导出摘要（复制 + 下载 .txt）
- [x] 更多分享形态：榜单 OG 卡（/og/leaderboard.png）+ 成员嵌入卡变体（?variant=countdown 倒计时版 / ?variant=track 赛道名次版）
- [x] 数据透明升级：口径页在线 + /daily?date= 按日历史归档（当日总粉丝 / 当日登阶 / 当日提及，逐日可追溯）

### ⑤ 打牢底座 —— 让站本身更好被找到

- [x] 导航收敛：顶栏改「首页 / 博主 / 内容」三项（榜单·广场·赛道并为博主模块三视图，日报并入首页），现有 URL 与 SEO 全部保留
- [x] 榜单排序与时间进 URL：榜 tab 与成长时间档（?tab=growth&range=7）可分享、可收录
- [x] RSS 订阅：/feed.xml 上线（登阶 + 爆款更新，零基础设施订阅）
- [x] 站点 AI 索引与 SEO 持续优化：/llms.txt 上线（含页面地图与数据口径）
- 性能、缓存与采集成本持续优化（ongoing，随迭代持续做，不设完成态）

> 以上方向全部基于现有平台与采集能力（SocialData + 本地分析脚本），不接新平台、不依赖第三方 AI 服务，随做随上线。

## 当前进度

- [x] 数据底座：成员名册、每日快照与登阶事件
- [x] X 数据采集管线（SocialData 已接入，每日自动采集）
- [x] 模块化看板：顶部导航一页一模块（总览 / 榜单 / 赛道 / 内容 / 关于）——总排行 / 成长榜 / 影响力 / 登阶记录独立榜单页，称号大关与社群全景在总览 → **[impact.kosx.ai](https://impact.kosx.ai)**
- [x] 成员自助加入与自助更新：看板弹窗提交 X 主页即入队刷新，非成员可直接建追踪
- [x] 成员进度卡片（可嵌入个人主页）：`https://impact.kosx.ai/card/{成员id}.svg`
- [x] 帖子活跃度统计：成员页与内容页展示近 20 帖的浏览 / 赞 / 评论汇总 + 互动 Top（已纳入每日自动采集，全部成员覆盖）
- [x] 博主内容赛道与标签：五赛道（AI工具/财经/开发者/增长/出海）+ 综合兜底，赛道页 `/tracks` 赛道榜 + 成员页赛道 chip/标签组（人工/agent 判断打标，分类脚本入库）
- [x] 精华帖展示：独立页 `/posts` 全社群近 30 天单帖浏览 Top（含摘要 + 原文外链，SEO 收录）
- [x] 影响力指数与榜单升级：综合评分（0-1000，规模/增长/互动/产能四项）+ 有效粉丝量（粉丝量 × 质量系数），看板影响力榜 + 成员页四维分项
- [x] 内容洞察：互动率中位数 / 爆款识别 / 话题标签云 / 停更检测（内容页「内容洞察」区块 + 成员页爆款/停更标记）
- [x] 成员内容周报：`/reports/{成员id}` 近 7 天战绩（粉丝变化 / 称号进度 / 帖子 Top / 互动率 / 登阶）
- [x] KOSX 声量监控（站外提及）：定时搜索 X 上对 KOSX 的提及，总览页「品牌声量」区块
- [x] 粉丝圈画像与相似账号推荐：SocialData 粉丝样本聚合（KOL 浓度 / 认证率 / 活跃度）+ 官方相似账号端点（成员页新区块）
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