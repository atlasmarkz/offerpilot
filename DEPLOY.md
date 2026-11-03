# 免费部署指南

目标：不花钱把 OfferPilot 放到网上，流量大了再升级。整条链路由三块组成：

```
本机/CI 采集器 ──sync──▶ Supabase（数据库）◀──读取── Vercel（网页端）◀── 浏览器扩展
```

## 一、需要的账号（都有免费档）

| 用途 | 平台 | 免费档的主要限制 |
|---|---|---|
| 放网页端 | [Vercel](https://vercel.com) | **Hobby 档仅限个人非商业使用**；每月约 100GB 流量 |
| 存岗位数据 | [Supabase](https://supabase.com) | 500MB 数据库；**7 天没有访问会被暂停**（点一下即可恢复）；每月 5GB 出站流量 |
| 定时采集（可选） | GitHub Actions | 公开仓库不限分钟；私有仓库每月 2000 分钟 |
| 简历解析的大模型 | 你自己的 LLM 服务 | **这是唯一会产生费用的部分**，按调用量计费 |

## 二、一次性设置

### 1. Supabase

1. 新建项目，记下 **Project URL**。创建页的设置：Region 选新加坡或东京；Security 里保持勾选 Enable Data API、取消勾选 Automatically expose new tables、勾选 Enable automatic RLS；数据库密码自己保存好。
2. 左侧 SQL Editor，把 `supabase/migrations/0002_job_listing.sql` 的内容粘进去运行（`0001` 暂时用不到，不用跑）。
3. Settings → API，记下两个密钥：
   - `anon public`：可以放在网页端，受行级安全限制，只能读**已审核**的岗位。
   - `service_role`：**只能放在你本机的 `.env` 或 GitHub Secrets 里**，绝不能进仓库或前端，它能绕过所有权限。

### 2. 把岗位送上去

在项目根目录的 `.env`（已被 git 忽略）里追加：

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=<service_role 密钥>
```

然后：

```bash
npm run crawl -w @offerpilot/crawler                                   # 采集（全部是“待审核”）
npm run review -w @offerpilot/crawler -- summary                       # 看各公司进度
npm run review -w @offerpilot/crawler -- list                          # 抽查几条
npm run review -w @offerpilot/crawler -- approve-company bilibili      # 抽查没问题就整家通过
npm run sync -w @offerpilot/crawler                                    # 把岗位和审核状态推上去
```

网页端**只展示已审核通过的岗位**，所以没审核就同步，线上页面是空的。

### 3. 部署网页端到 Vercel

1. 把仓库推到 GitHub（已经完成）。
2. Vercel → Add New Project → 选 `offerpilot` 仓库。
3. **Root Directory 选 `apps/web`**，并保持开启 “Include source files outside of the Root Directory”（monorepo 里 `packages/shared` 要用到）。
4. 在 Environment Variables 里填：

| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_ANON_KEY` | anon 公钥 |
| `LLM_BASE_URL` `LLM_API_KEY` `LLM_MODEL` | **可选**。用户可以在页面“模型设置”里填自己的 Base URL / API Key / 模型名（密钥只存在其浏览器里），那样费用由用户自己承担。这三项是你自备的兜底模型，只在用户没填时使用且受每日次数限制；**想让简历解析完全不花你的钱，就不要填** |
| `ALLOW_PRIVATE_LLM_URLS` | 默认不设。生产环境会拒绝 http 和内网地址（防止服务器被用来访问内网）；仅在你自托管、需要连内网模型时设为 `1` |
| `RESUME_PER_IP_LIMIT` | 每个 IP 每天解析次数，默认 5 |
| `RESUME_DAILY_LIMIT` | 全站每天解析次数，默认 200 |
| `RESUME_ENABLED` | 设为 `0` 可整体关闭简历解析 |

5. Deploy。之后每次 push 到 `main` 都会自动重新部署，你会得到 `https://xxx.vercel.app`。

> 简历解析的限流计数在内存里，Vercel 上每个实例各记各的，只能挡住明显的滥用。要真正控制花费，请同时在大模型服务商那边设置**月度额度上限**。

### 4. 浏览器扩展指向线上域名

```bash
cd apps/extension
WXT_WEB_ORIGIN=https://xxx.vercel.app npx wxt build
```

然后在 `chrome://extensions` 打开开发者模式，“加载已解压的扩展程序”，选 `.output/chrome-mv3`。
想让别人也能装，需要上架 Chrome 应用商店（一次性 5 美元开发者注册费），这一步不是必须的。

### 5. 定时采集（可选）

`.github/workflows/crawl.yml` 已经写好，默认只能手动触发。到仓库 Settings → Secrets and variables → Actions 添加 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`，在 Actions 页面手动运行一次确认没问题，再取消文件里 `schedule` 的注释。

它用的是 `--keep-review` 同步：只更新岗位内容，不会把你已审核通过的岗位重置。新岗位仍是待审核，需要你在本机 `crawl → review → sync` 后才会上线。

## 三、自己的域名

Vercel 项目 → Settings → Domains 添加你的域名，再按提示到域名商处加一条 CNAME 解析，证书自动签发。
`.com` 每年约一百元。放在 Vercel（海外）**不需要备案**，但国内个别网络访问 `vercel.app` 不稳定，自己的域名通常会好一些；若要把服务器放在国内云上，则必须先做 ICP 备案。
换了域名后，记得用新的 `WXT_WEB_ORIGIN` 重新构建扩展。

## 四、什么时候该考虑付费

| 信号 | 说明 | 怎么办 |
|---|---|---|
| 开始对企业收费、做商业化 | Vercel Hobby **不允许商业使用** | 升级 Vercel Pro（约 20 美元/月/成员），或迁到允许商用的免费平台（如 Cloudflare Pages，Next 需要额外适配） |
| 月访问量上来，流量超过免费额度 | Vercel 约 100GB/月；岗位列表接口约 2–3MB，压缩后传输更小 | 看 Vercel Usage 页；岗位变多时把筛选改到服务端分页 |
| 大模型账单增长 | 只有你配了自备模型才会发生；用户自带密钥时费用在用户那边 | 不配自备模型，或调低每日上限、要求登录后才能用 |
| 需要账号、投递看板、云端保存画像 | 免费档的 Supabase 够用，但要接入 Supabase Auth，`0001` 里的表就是为此设计的 | 开发工作，不一定要付费 |
| 数据库接近 500MB 或需要不暂停 | 现在约 4000 条岗位，只有几 MB | Supabase Pro（约 25 美元/月） |
| 采集量变大 | GitHub Actions 私有仓库超过 2000 分钟 | 仓库转公开，或租一台小服务器跑采集 |

按目前的规模（几千条岗位、少量用户），这条免费链路够用；真正会先花钱的通常是**大模型调用**，其次是商业化后的 Vercel 套餐。

## 五、账号登录（邮箱验证码）

登录用 Supabase 自带的邮箱验证码，**不需要任何企业资质**。网页端的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 沿用现有的，不需要新增环境变量。需要在 Supabase 里做三件事：

### 1. 建表

SQL Editor 里运行 `supabase/migrations/0003_user_data.sql`（可重复运行）。它会创建存画像和已选岗位的 `user_data` 表，开启行级安全（每人只能读写自己的行），并创建“用户自助删除账号”的函数。

### 2. 邮件模板里要有验证码

Authentication → Email Templates，把 **Magic Link** 和 **Confirm signup** 两个模板的正文都改成包含 `{{ .Token }}`，例如：

```
<h2>OfferPilot 登录验证码</h2>
<p>你的验证码是：<b>{{ .Token }}</b></p>
<p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
```

两个都要改：新用户第一次登录发的是 Confirm signup，老用户发的是 Magic Link。默认模板只有链接、没有验证码，用户会收到邮件却没法输入。

### 3. 配置发信邮箱（SMTP）——这一步必须做

Supabase 内置的发信服务**只能发给你团队成员的邮箱，且每小时只有几封**，只够自己试一试。要让别人也能收到验证码，必须在 Authentication → Emails → SMTP Settings 里配置自己的 SMTP。没有域名也能用的几种选择：

| 方案 | 说明 |
|---|---|
| QQ 邮箱 / 163 邮箱 | 免费。在邮箱设置里开启 SMTP 并生成“授权码”，服务器如 `smtp.qq.com`，端口 465，密码填授权码。每天有发送上限，适合早期；发件人显示为你的个人邮箱 |
| Gmail | 开启两步验证后生成“应用专用密码”，`smtp.gmail.com`，端口 465 |
| Resend / 其他邮件服务 | 发送体验最好，但要验证自己的域名 |

配好后在 Authentication → Rate Limits 里确认“每小时发送邮件数”够用。

### 4. 验证

打开线上页面，点右上角“登录 / 注册”，用自己的邮箱收验证码登录；填一点画像，等几秒看到“已同步到云端”；换个浏览器登录同一个邮箱，画像应该会自动出现。

### 说明

- **没配 Supabase 时（本地文件模式）登录入口会自动隐藏**，不影响本地试用。
- 登录状态存在 httpOnly 的 Cookie 里，最长 30 天。
- 云端只保存画像和已选岗位；简历文件和大模型 API Key 永远不上云。
- 发验证码有两道限流：本站每个 IP 每天 `AUTH_CODE_PER_IP`（默认 20）次、全站 `AUTH_CODE_DAILY`（默认 500）次；Supabase 对同一邮箱还有每分钟一次的限制。被人刷接口时，建议再接入 Supabase 的验证码人机校验（Authentication → Attack Protection，支持 Cloudflare Turnstile / hCaptcha）。
- 手机号、微信登录需要短信或微信开放平台的企业资质，条件具备后再作为新的登录方式接入，账号体系不用改。

## 六、托管版计费（额度与订阅）

详见 [docs/PRODUCT.md](docs/PRODUCT.md)。上线计费版要做的事：

1. SQL Editor 运行 `supabase/migrations/0004_billing_resume.sql`（可重复运行）。
2. Vercel 环境变量里新增：`BILLING_ENABLED=1`，以及 **`SUPABASE_SERVICE_KEY`**。
   这是整个部署里**唯一**需要把 `service_role`/secret 密钥放到服务端的地方——扣额度和发放额度必须由服务端特权调用，否则用户能自己改余额。它只存在服务端环境变量里，页面代码拿不到；务必设为 Vercel 的“Sensitive”变量，且不要给 Preview 环境。
3. `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 填你的 MiniMax。开启计费后，这套模型只对登录且有额度的用户开放；用户自带模型不受影响。
4. 支付接入前，用管理员命令手动发放额度：`npm run billing -w @offerpilot/crawler -- grant 邮箱 20`。
5. 自托管（给用户自己部署）时**不要**设 `BILLING_ENABLED`，所有功能不计费，用户在页面“模型设置”或环境变量里填自己的模型。

## 七、上线前自检

- [ ] `.env` 没有被提交（`git status` 里看不到它）。
- [ ] `service_role` 密钥只出现在本机 `.env` 和 GitHub Secrets 里。
- [ ] 线上页面能看到已审核的岗位，看不到待审核的。
- [ ] 已运行 `0003_user_data.sql`，邮件模板含 `{{ .Token }}`，并配置了自己的 SMTP；能用真实邮箱完成登录。
- [ ] 开启计费时：`0004` 已运行，`SUPABASE_SERVICE_KEY` 仅设在服务端，未登录用站点模型会被拒绝，额度不足返回 402。
- [ ] 隐私说明页（`/privacy`）打开正常，内容和你实际使用的大模型服务相符。
- [ ] 大模型服务商处已设置月度额度上限。
- [ ] 岗位只展示摘要并跳转官网投递；对外推广前，再核对各公司网站的使用条款与 `robots.txt`。
