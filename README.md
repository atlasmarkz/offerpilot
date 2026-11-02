# OfferPilot

面向校招应届生（互联网 / 金融 / 国央企）的岗位匹配与半自动投递平台。

## 当前状态：v1.0 = 岗位采集管道

| 模块 | 状态 |
|---|---|
| `packages/shared`：画像/岗位 schema、硬条件过滤 | 可用，带测试 |
| `apps/crawler`：12 家公司（16 个数据源）的岗位采集、硬条件抽取、人工审核队列 | **v1.0 可用**，见 [apps/crawler/README.md](apps/crawler/README.md) |
| `apps/extension`：浏览器扩展（WXT）填表原型 | 原型，仅示例适配器 |
| `supabase/migrations`：数据库结构（含行级安全） | 已设计，尚未接入采集器 |
| Web 端（画像、匹配列表、看板）、企业端 | 未开始 |

## 结构

- `packages/shared`：画像与岗位的 zod schema、硬条件过滤
- `apps/crawler`：岗位采集 → 硬条件抽取 → 待审核队列（一律 pending，需人工审核）
- `apps/extension`：浏览器扩展，按站点适配器自动填表，默认由用户点提交
- `supabase/migrations`：数据库结构（Postgres + pgvector，含行级安全）

## 开发

```bash
npm install
npm test
npm run typecheck
npm run crawl -w @offerpilot/crawler      # 采集岗位（需要本机 Chrome）
npm run dev -w @offerpilot/extension      # 扩展开发模式
```

## 原则

- 验证码、短信验证一律交回用户，不绕过。
- 自动提交只作为进阶选项，需风险确认并带每日上限与熔断。
- 简历与站点登录态默认只留在本地。
- 自动采集的岗位必须人工审核后才对用户可见。
