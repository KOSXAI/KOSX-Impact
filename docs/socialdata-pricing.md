# SocialData 定价与用量参考

> 目的：为 KOSX Impact 后续「X 数据监控 / 竞品监控」系统的成本测算与方案选型提供依据。
> 核对日期：2026-09-07，内容逐条核对自官方文档（来源见文末）。
> ⚠️ 定价与限流可能调整，任何大额实施决策前请复查官方文档。

## 一、计费模型总则

| 规则 | 内容 |
| --- | --- |
| 计费单位 | 按**实际返回的数据条数**计费，不是按 HTTP 调用次数 |
| 基准价 | **$0.0002 / 条**（$0.20 / 1000 条），绝大多数接口适用 |
| 充值制 | 预充值余额，**无订阅、无月费、无最低充值额**；余额不过期、不清零 |
| 失败不收费 | SocialData 侧未能从 X 抓到数据 → 本次不计费 |
| 空响应规则 | 空响应默认不收费；**每分钟前 3 次请求免费**，超出后空响应也按 $0.0002/次 兜底计费 |
| 余额见底 | 余额 ≤ 0 时请求被拒（**HTTP 402**），不产生负余额 |
| 新账号 | **无免费套餐、无初始赠额**（可向官方申请演示账号）；注册无需信用卡 |
| 退款 | 未使用的充值，14 天内可无理由退款 |
| 提额 | 高用量可联系官方**免费**提高限流 |

> ⚠️ **没有「免费版 / 付费版」套餐之分**：充值余额制是唯一形态，不充值完全不可用（无免费套餐、无赠额，演示账号需联系官方申请）。「每分钟 3 次免费请求」是所有账号同权的**空响应豁免**，不是档位特权；**速率（120 req/min / Key）不因充值多少而变化**，充多少都不提速，高用量提额也免费。全产品唯一的量价阶梯是 User Monitor 分档单价（监控越多单价越低，$4.99 → $2.49）。

四种访问方式共用同一 API Key、同一余额，没有独立订阅：

| 方式 | 用途 | 计费 |
| --- | --- | --- |
| Data API（REST） | 按需取数：profile / followers / tweets / search… | 按条计费 |
| Monitoring API | Webhook 推送：发帖/关注变化/资料变化/关键词命中 | 见第三节 |
| Social Actions | 单次验证：是否关注/转推/评论 | 高价接口 |
| MCP | 给 Claude Code / Cursor 等直接调用 | **每个工具调用与等价 REST 调用同价，无额外费用** |

## 二、REST 接口价格总表

### 用户类（KOSX 当前主力）

| 接口 | 价格 | KOSX 备注 |
| --- | --- | --- |
| Get User Profile（`/twitter/user/:username`） | $0.0002 / 请求 | ✅ 现用：每日采集 + 自助刷新队列 |
| Bulk Profiles by IDs / by Usernames | $0.0002 / 人，**每请求上限 100 人** | 批量补档首选，省请求次数 |
| Followers / Verified Followers | $0.0002 / 粉丝 | 竞品粉丝全量拉取用 |
| Following | $0.0002 / 人 | 关注链分析 |
| User Tweets & Replies | $0.0002 / 帖 | 竞品发帖监控 |
| Mentions / Affiliates / Highlights / User Lists | $0.0002 / 条 | |
| **Extended Bio** | **$0.001 / 请求** | ⚠️ 唯一高于基准价的用户接口（5 倍） |
| Similar Profiles | $0.0002 / 人 | |

### 帖子 / 搜索类（竞品监控要用）

| 接口 | 价格 |
| --- | --- |
| Search（关键词/标签/高级操作符） | $0.0002 / 条搜索结果 |
| Get Tweet / Article Details | $0.0002 / 请求 |
| Bulk Tweets by IDs | $0.0002 / 帖（每请求上限 100 条） |
| Tweet Comments | $0.0002 / 评论 |
| Tweet Quotes | $0.0002 / 条 |
| Tweet Retweeters | $0.0002 / 人 |
| Thread | $0.0002 / 帖 |

### 社交验证类（Social Actions，⚠️ 20–40 倍高价，勿在批量场景误用）

| 接口 | 价格 |
| --- | --- |
| Verify User Is Following | $0.004 / 请求 |
| Verify User Retweeted | $0.008 / 请求 |
| Verify User Commented | $0.008 / 请求 |

### 其他

Lists（详情/成员/帖子）、Communities（详情/帖子/成员/搜索）、Spaces 详情：全部 $0.0002 / 条。

## 三、Monitor 持续监控（与 REST 的成本形态完全不同）

### User Monitor（User Tweets / User Following / User Profile 三类）

- 按**活跃监控数**计费，**每小时扣一次**（创建时刻即扣首小时），与事件量无关——一个账号一小时发 100 帖和发 0 帖同价
- **同一账号监控「发帖 + 关注变化 + 资料变化」= 3 个 Monitor**
- 阶梯单价（每月自动按活跃总数分档）：

| 活跃监控数 | 每小时 | ≈ 每月 |
| --- | --- | --- |
| 1–10 | $0.0069 | $4.99 |
| 11–100 | $0.0062 | $4.49 |
| 101–300 | $0.0055 | $3.99 |
| 301–500 | $0.0048 | $3.49 |
| 501–1000 | $0.0042 | $2.99 |
| 1000+ | $0.0035 | $2.49 |

行为要点：

- 余额扣不出 → 监控**暂停而非删除**，配置保留，充值后自动恢复
- webhook 挂了**照样计费**（检测已发生，不因投递失败而免单）
- 同一事件多次投递**不重复计费**
- 删除监控：中间时刻已执行的仍按已执行计费（User Monitor 按小时扣）

### Search Monitor（关键词监控）

- **无创建费、无小时费**；按执行次数计费：
  - 搜到新帖：$0.0002 / 帖
  - 搜到 0 条：每次执行也扣 **$0.0002 保底**（搜索本身跑了）
- 频率 → 每月保底成本表（保底之外搜到的帖子按条另加）：

| 频率 | 每月最低成本 |
| --- | --- |
| 每 30 秒 | ~$17.28 |
| 每分钟 | ~$8.64 |
| 每 5 分钟 | ~$1.73 |
| 每小时 | ~$0.14 |

- 空执行的费用按小时结算，删除监控时再结算一次
- 指导原则：选业务能容忍的最慢频率

### 何时该用 Monitor？

Monitor 的价值只在「**分钟级以下的实时** + 免轮询」。低频（小时/日级）的取数需求用 REST 轮询便宜 1–2 个数量级（测算见第六节）。

## 四、限流（实施时的硬约束）

- **120 请求 / 分钟 / API Key，全端点共享**（不是每个端点各 120）——这是硬上限，超了被节流报错
- 批量接口单请求上限：100 条（profiles / tweets）
- 高用量免费提额：联系官方说明用量即可
- 对现有管线的含义：`src/sources/socialdata.ts` 的 20 秒节流（≈3 req/min）**远低于** 120/min 限流。该节流的目标是「空响应免费额度」而非限流，且对 user profile 这类必然返回数据的接口，`$0.0002/次` 本来就照收——**节流并没有省钱，只限制速率**。未来如需提速（如自助刷新队列扩容），速率空间约 40 倍，单价不变，真正涨的是绝对开销。

## 五、KOSX 现有管线成本（已上线部分测算）

| 场景 | 用量 | 月成本 |
| --- | --- | --- |
| 每日采集 100 成员（现规模） | ~100 req / 天 | ≈ $0.60 |
| 每日采集 500 成员 | ~500 req / 天 | ≈ $3.00 |
| 每日 4 次 × 500 成员 | ~2000 req / 天 | ≈ $12.00 |
| 自助刷新队列（理论上界） | 21s CAS 槽 ≈ 4114 req / 天 | ≈ $25（仅当 24h 全打满；实际由用户点击驱动，远低于此） |
| 档案补录 backfill（57 人，一次性） | 57 req | ≈ $0.011 |

结论：每天每人一次的「粉丝数/资料」轮询成本可忽略。$10 充值 ≈ 5 万次 profile 请求，够 500 人规模日更一个季度（按 $3/月）。

## 六、未来竞品监控方案成本对比（选型参考）

### 场景 A：监控 N 个账号的粉丝数/发帖情况

| 方案 | 100 账号/月 | 1000 账号/月 | 特点 |
| --- | --- | --- | --- |
| REST 轮询 每日 1 次 | $0.60 | $6.00 | 日更节奏，KOSX 现状形态 |
| REST 轮询 每小时 1 次 | $14.40 | $144 | 接近实时，无 webhook 维护 |
| User Monitor（实时） | ≈ $449（11–100 档） | ≈ $3,490（501–1000 档） | 秒级实时 + 免轮询 |

→ 非实时需求（KOSX 这类「日报/日更」）：REST 轮询便宜 1–3 个数量级；Monitor 仅在「分钟级实时价值」明确时划算。

### 场景 B：拉取某竞品全量粉丝做画像/重合分析

- 1 万粉账号拉一次：**$2**；10 万粉：**$20**
- 高频全量拉取很贵：10 万粉账号每天拉一次 ≈ $600/月 → 应低频全量 + 高频增量（拉 followers 后按增量或直接沿用 Monitor 的关注变化推送）

### 场景 C：品牌 / 关键词舆情监控

- Search Monitor 每小时 ≈ $0.14/月 保底起、5 分钟 ≈ $1.73/月 —— 比 User Monitor 便宜得多，适合「某关键词有没有人提 / 提到多少」类需求

## 七、三源成本对比：SocialData vs 官方 X API vs 自建爬虫

> 核对日期 2026-09-07。⚠️ 官方 X API 定价自 2026-02 起改为**按用量计费**（pay-per-use，预付点数、无月度订阅承诺），试点价：读 1 条 Post $0.005、读 1 个 User $0.01、写 1 条 Post $0.015（带链接 $0.20）；「Owned Reads」自读数据 $0.001/资源（仅限自己的 posts/followers/following 等端点）。旧 Basic $200/月、Pro $5,000/月套餐仍在售，新老用户可切换。

### 核心场景：每日抓 1 次 N 个账号的 profile（KOSX 现有形态）

| 账号规模 | SocialData | 官方 X API（按用量） | 自建爬虫 |
| --- | --- | --- | --- |
| 100 | **$0.60 / 月** | $30 / 月（3,000 User reads） | 见下文 |
| 1,000 | **$6 / 月** | $300 / 月 | 见下文 |
| 10,000 | **$60 / 月** | $3,000 / 月 | 见下文 |

结论：**官方 X API 单价是 SocialData 的 50 倍**（$0.01 vs $0.0002），且「Owned Reads」低价不适用于 KOSX——它只覆盖**自己的**账号数据，而 KOSX 追踪的是成员/竞品（第三方）账号，只能走全价 $0.01/User Read。若未来走「成员 OAuth 授权」读取成员自己的数据，官方 Owned Reads $0.001/资源 与 SocialData 同量级（贵 5 倍），但要成员授权配合 + 官方额度管理，复杂度高。

### 限流对比（10,000 账号日更一次的吞吐）

| 数据源 | 限流 | 10,000 请求耗时 |
| --- | --- | --- |
| SocialData | 120 req/min / Key（可免费提额） | ≈ 83 分钟 |
| 官方 X API | user lookup 300 req / 15 分钟 / App（≈20 req/min） | ≈ 8.3 小时（单 App，需多 App 或排队） |

### 「自建爬虫」的账（无 API 费 ≠ 免费）

- **反爬工程成本**：X 对未登录/机房流量强反爬（JS 渲染 + bot 检测），稳定抓取基本依赖住宅代理（约 $3–8/GB）；profile 页 JS 重（约 2–5MB/次），1,000 账号/天 ≈ 3–5GB ≈ **$10–40/月纯流量**，还不含对抗开发的工程人时
- **风险**：封号封 IP、ToS 违约、无 SLA；对抗成本随规模上升，且 X 每改版一次就有系统性归零风险
- **结论**：百级规模「能爬」，千级以上工程成本超过 API 费；对 KOSX 这种公开数据平台，合规与稳定是刚需，自建不可作为长期方案

### 选型结论

- KOSX 现有场景（第三方账号 profile 日更）：**SocialData 最优**——比官方 API 便宜 50 倍，又比自建爬虫省掉全部工程与合规风险
- 值得切换官方 API 的理由只剩：需要**写操作**（发帖/互动）、企业级 SLA/数据契约（Enterprise 定制价）、或官方独占的数据功能
- 自建爬虫只适合一次性研究型小批量抓取，不适合生产线

## 八、API 对接速查（开发用，2026-09-07 核对）

### 认证与基础

- Base URL：`https://api.socialdata.tools`
- 每个请求必须带 `Authorization: Bearer <API_KEY>` + `Accept: application/json`，无认证一律拒绝
- Key **永不过期**，在 dashboard 生成/管理；泄露等于余额风险，当密码对待
- 同一 Key 共用 REST / Monitor / Social Actions / MCP 四通道与 120 req/min 共享限流

### 核心端点 URL 形态

| 端点 | 方法 / 路径 | 关键参数 | 备注 |
| --- | --- | --- | --- |
| Get User Profile | `GET /twitter/user/{username}` | username 不带 @，也可传数字 ID | ✅ 现状管线（`src/sources/socialdata.ts`）；响应字段与 Twitter v1.1 users/show 一致 |
| Bulk Profiles by IDs | `POST /twitter/users-by-ids` | body `{"ids": ["44196397", …]}`，**每请求 ≤100 个** | 返回 `{users:[…]}`；**ID 必须用字符串**（int64 超 JS 整数上限） |
| Get User Followers | `GET /twitter/user/{user_id}/followers?cursor={cursor}` | 路径参数是**数字 ID**（不是 username） | 分页：响应 `next_cursor` 回填 `cursor`，省略取第一页；无页大小参数 |
| Search 等其余端点 | 见官方 API 参考（docs.socialdata.tools/reference/…） | — | 全部 $0.0002/条 |

### 错误码表（官方 Errors 页核对）

| 状态码 | 含义 | 处理建议 |
| --- | --- | --- |
| 401 | 无有效 API Key | 查 env 配置 |
| **402** | 余额不足 | **停止采集 + 告警，充值后续跑**；勿无限重试 |
| 403 | Key 无权限 | 查 Key 权限 |
| **404** | 资源不存在（profile 端点 = 账号不存在/已封禁） | 名册标记「账号失效」，别当故障重试 |
| 422 | 参数校验失败 | 查请求参数 |
| 429 | 限流 | 指数退避重试（官方建议） |
| 500 / 502 / 503 | SocialData 侧异常（罕见） | 重试通常成功 |

注：官方错误码表里没有 400；`src/sources/socialdata.ts` 把 `!ok` 统一抛 `SocialDataError`（透传 status），对 402/404/429 分流时可直接 `err.status` 判断。

## 九、实施注意点清单（给后面系统设计）

1. **402 兜底**：余额 ≤ 0 时全部请求失败，采集管线必须识别 HTTP 402 并暂停（避免无限重试烧日志）；官方提供余额预警通知与自动充值，建议启用
2. **空响应免费额度的语义**：免费 3 次/分钟只豁免「空响应」；返回数据的请求一律 $0.0002。设计节流时别把 3 req/min 当成本红线，120 req/min 才是硬限流
3. **批量接口优先**：批量拉 profiles / tweets 用 Bulk 端点（100/请求），省请求数、省限流占用，单价不变
4. **失败不计费**：SocialData 抓取失败不扣钱，重试策略可以放心设计（注意 402 除外）
5. **Monitor 与 REST 不要混记账**：成本形态完全不同（Monitor 按活跃数小时扣费，与事件量无关）；余额不足时 Monitor 暂停而非删除，别误判为丢失
6. **成本对账**：官方有用量面板 + 低余额通知；也可自建对账（记录每日请求数 × 单价，与余额下降幅度比对，能早期发现异常调用）
7. **MCP 免费溢价**：MCP 与 REST 同价，临时人工查数（比如运营核对某个账号）直接走 MCP 或 REST 均可，成本一样
8. **404 分流**：profile 端点返回 404 = 账号不存在/已封禁，名册应标记「账号失效」走人工复核，不要当故障无限重试

## 十、来源（核对日期 2026-09-07）

- Overview: https://docs.socialdata.tools/getting-started/overview/
- Pricing: https://docs.socialdata.tools/getting-started/pricing/
- Authentication: https://docs.socialdata.tools/getting-started/authentication/
- Errors: https://docs.socialdata.tools/getting-started/errors/
- Monitoring Pricing: https://docs.socialdata.tools/monitoring/pricing/
- Rate Limits: https://docs.socialdata.tools/getting-started/rate-limits/
- API 参考（Get User Profile / Multiple Profiles / Followers 等）: https://docs.socialdata.tools/reference/
- 主页（充值/退款/免费套餐说明）: https://socialdata.tools/
- 官方 X API 按用量计费与 Owned Reads: https://docs.x.com/x-api/getting-started/pricing
- 官方 X API rate limits: https://docs.x.com/x-api/fundamentals/rate-limits