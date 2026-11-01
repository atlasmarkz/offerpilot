# OfferPilot

面向校招应届生（互联网 / 金融 / 国央企）的岗位匹配与半自动投递平台。

## 结构

- `packages/shared`：画像与岗位的 zod schema、硬条件过滤（已带测试）
- `apps/crawler`：岗位采集 → 大模型抽取 → 入库（一律 pending，需人工审核）
- `apps/extension`：浏览器扩展（WXT），按站点适配器自动填表，默认由用户点提交
- `supabase/migrations`：数据库结构（Postgres + pgvector，含行级安全）

## 开发

```bash
npm install
npm test
npm run typecheck
npm run dev -w @offerpilot/extension
```

## 原则

- 验证码、短信验证一律交回用户，不绕过。
- 自动提交只作为进阶选项，需风险确认并带每日上限与熔断。
- 简历与站点登录态默认只留在本地。
