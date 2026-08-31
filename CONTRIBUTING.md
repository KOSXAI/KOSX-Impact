# 贡献指南

感谢你对 KOSX Impact 的关注！这个项目既是公开数据平台，也是社区共同维护的仓库。你可以通过以下方式参与：

## 参与方式

| 方式 | 适合 | 入口 |
| --- | --- | --- |
| 代码贡献 | 功能、修复、文档 | Issue / PR |
| 申请加入追踪 | KOSX 成员 | 「成员申请」Issue |
| 建议新数据源 | 所有人 | 「数据源建议」Issue |
| 反馈与讨论 | 所有人 | Issue |

## 本地开发

```bash
npm install
npm run db:migrate:local
npm run dev
```

提交前请确保本地检查全部通过：

```bash
npm run check   # typecheck + 测试，与 CI 一致
```

## 提 Issue

- 使用对应模板：Bug 报告 / 功能建议 / 成员申请 / 数据源建议
- **成员申请必须勾选「公开追踪同意声明」**，这是数据合规的前提
- 报告数据问题时，请附上时间点和相关成员，便于定位

## 提 PR

1. Fork 本仓库，从 `main` 切出分支
2. 完成改动并在本地验证（`npm run check`）
3. 发起 PR，按模板填写说明并关联 Issue
4. CI 必须通过，维护者 review 后合并

数据相关的 PR 额外要求：

- 涉及数据采集 / 展示的变更，说明数据来源与更新口径
- 涉及成员个人数据的变更，需确认成员同意公开

## 维护者指引

- 开启 `main` 分支保护，要求 CI 通过后才能合并
- 部署依赖两个 Secrets：`CLOUDFLARE_API_TOKEN`（Workers 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`
- **成员加入流程**：审核「成员申请」Issue（确认同意声明已勾选）→ 在 D1 中插入 `members` 记录：

  ```bash
  npx wrangler d1 execute kosx-impact --remote \
    --command "INSERT INTO members (id, handle, display_name, joined_at) VALUES ('kosx', 'kosx', 'KOSX', '2026-08-31')"
  ```

- **成员退出**：将该成员 `status` 置为 `removed`；如成员要求移除历史数据，删除其 `snapshots` / `milestones` 记录
- 数据库变更一律通过 `migrations/` 下的新迁移文件进行，不直接改线上库

## 沟通与行为规范

- 讨论对事不对人；尊重每一位成员的数据与隐私
- 不展示、不讨论任何成员未公开的信息
