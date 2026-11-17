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
| `LLM_REASONING_EFFORT` | **可选**。推理型模型的思考强度。地址含 `minimax` 时默认 `low`（实测简历解析从约 20 秒降到约 7 秒，结果质量没有明显差别）；其他服务默认不传；填 `none` 表示不传 |
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

## 五、账号登录（邮箱 + 密码，验证码只用来验证邮箱）

用户用**邮箱 + 密码**注册和登录。注册、找回密码时会给邮箱发一个验证码，只用来确认邮箱是本人的；之后日常登录不再收邮件。底层用 Supabase 自带的认证，**不需要任何企业资质**。网页端的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 沿用现有的，不需要新增环境变量。需要在 Supabase 里做这几件事：

### 1. 建表

SQL Editor 里运行 `supabase/migrations/0003_user_data.sql`（可重复运行）。它会创建存画像和已选岗位的 `user_data` 表，开启行级安全（每人只能读写自己的行），并创建“用户自助删除账号”的函数。

### 2. 打开邮箱验证，并把验证码设成 6 位

- Authentication → Sign In / Providers → Email：**Confirm email 保持开启**（注册必须先验证邮箱），**Email OTP Length 设为 6**（默认可能是 8）。网页和接口都不写死位数，以这里的设置为准。
- Authentication → Email Templates：**Confirm signup** 和 **Reset Password** 两个模板的正文都要包含 `{{ .Token }}`，例如：

```
<h2>OfferPilot 验证码</h2>
<p>你的验证码是：<b>{{ .Token }}</b></p>
<p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
```

默认模板只有链接、没有验证码，用户会收到邮件却没法输入。注册发的是 Confirm signup，找回密码发的是 Reset Password。

### 3. 配置发信邮箱（SMTP）——这一步必须做

Supabase 内置的发信服务**只能发给你团队成员的邮箱，且每小时只有几封**，只够自己试一试。要让别人也能收到验证码，必须在 Authentication → Emails → SMTP Settings 里配置自己的 SMTP。没有域名也能用的几种选择：

| 方案 | 说明 |
|---|---|
| QQ 邮箱 / 163 邮箱 | 免费。在邮箱设置里开启 SMTP 并生成“授权码”，服务器如 `smtp.qq.com`，端口 465，密码填授权码。每天有发送上限，适合早期；发件人显示为你的个人邮箱 |
| Gmail | 开启两步验证后生成“应用专用密码”，`smtp.gmail.com`，端口 465 |
| Resend / 其他邮件服务 | 发送体验最好，但要验证自己的域名 |

配好后在 Authentication → Rate Limits 里确认“每小时发送邮件数”够用。

**验证码邮件慢怎么办**：页面点完会立刻进入输入验证码的一步，并显示已等待多久。慢通常出在 SMTP 服务本身（Gmail 常要几秒到十几秒，还可能进垃圾箱）。浏览器开发者工具里看注册请求的 `Server-Timing: upstream;dur=…`，就是 Supabase 发邮件花的毫秒数：很大说明慢在邮件服务，换 Resend / Brevo 这类事务邮件服务会明显更快；很小说明慢在邮件投递。另外把 Vercel 函数区域设到离 Supabase 近的地方（Project Settings → Functions → Region）也能省下往返时间。

### 4. 验证

打开线上页面，点右上角“登录 / 注册”，用邮箱 + 密码注册，收验证码完成验证；再退出，用密码登录一次，并试一下“忘记密码”；填一点画像，等几秒看到“已同步到云端”；换个浏览器登录同一个邮箱，画像应该会自动出现。

### 说明

- **没配 Supabase 时（本地文件模式）登录入口会自动隐藏**，不影响本地试用。
- 登录状态存在 httpOnly 的 Cookie 里，最长 30 天。
- 云端只保存画像和已选岗位；简历文件和大模型 API Key 永远不上云。
- 密码规则：8~72 位，必须同时含字母和数字；登录失败提示不区分“邮箱不存在”和“密码错”。
- 发验证码有两道限流：本站每个 IP 每天 `AUTH_CODE_PER_IP`（默认 20）次、全站 `AUTH_CODE_DAILY`（默认 500）次；Supabase 对同一邮箱还有每分钟一次的限制。被人刷接口时，建议再接入 Supabase 的验证码人机校验（Authentication → Attack Protection，支持 Cloudflare Turnstile / hCaptcha）。
- 手机号、微信登录需要短信或微信开放平台的企业资质，条件具备后再作为新的登录方式接入，账号体系不用改。

## 六、托管版计费（额度与订阅）

详见 [docs/PRODUCT.md](docs/PRODUCT.md)。上线计费版要做的事：

1. SQL Editor 运行 `supabase/migrations/0004_billing_resume.sql`（可重复运行）。
2. Vercel 环境变量里新增：`BILLING_ENABLED=1`，以及 **`SUPABASE_SERVICE_KEY`**。
   这是整个部署里**唯一**需要把 `service_role`/secret 密钥放到服务端的地方——扣额度和发放额度必须由服务端特权调用，否则用户能自己改余额。它只存在服务端环境变量里，页面代码拿不到；务必设为 Vercel 的“Sensitive”变量，且不要给 Preview 环境。
3. `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 填你的 MiniMax（保存后要重新部署才生效）。开启计费后，这套模型只对登录用户开放：免费版每月 3 次，付费订阅按等级给额度，用户自带模型不受影响也不占额度。
4. 支付接入前，用管理员命令手动发放额度：`npm run billing -w @offerpilot/crawler -- grant 邮箱 20`。
5. 自托管（给用户自己部署）时**不要**设 `BILLING_ENABLED`，所有功能不计费，用户在页面“模型设置”或环境变量里填自己的模型。

### 免费版每月 3 次（0006）

SQL Editor 运行 `supabase/migrations/0006_free_allowance.sql`（可重复运行，要在 0004 之后）。免费用户每个自然月（UTC）可用站点模型 3 次，用完再用次数包；失败的调用自动退还。想改成别的次数，要同时改 `packages/shared/src/plans.ts` 的 `free.monthlyQuota` 和 0006 里的 `free_quota`。

### 隐私清理（0008）

姓名、手机、邮箱、证件号等个人隐私信息现在只存在用户自己的浏览器里，不上云（网页端的“个人隐私信息”面板，扩展本机读取）。SQL Editor 运行 `supabase/migrations/0008_scrub_private.sql`（可重复运行）：清掉此前已经上传的在线简历联系方式和云端画像里的姓名。服务端的保存接口也会主动丢弃这类字段。

### 公司类型扩充（0011）

SQL Editor 运行 `supabase/migrations/0011_company_types.sql`（可重复运行）。岗位的公司类型新增芯片半导体、汽车、硬件制造，不运行的话这几类岗位同步时会被数据库拒绝。

### 平台投递记录（0009）

SQL Editor 运行 `supabase/migrations/0009_applications.sql`（可重复运行，要在 0005 之后）。它会创建 `application` 表，存浏览器扩展在 Boss直聘等平台上的投递记录，供“投递看板”的投递总览统计；每人最多 5000 条。

### 岗位每日更新与下架（0010）

SQL Editor 运行 `supabase/migrations/0010_job_freshness.sql`（可重复运行）。它给 `job_listing` 加上数据源、发布日期、首次收录 / 最近确认在招时间、在招 / 下架状态。然后在 GitHub 仓库 Settings → Secrets and variables → Actions 里配置 `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`，`crawl-and-sync` 工作流会每天北京时间凌晨 3 点自动采集、同步、复查。第一次可以在 Actions 页面手动点 “Run workflow” 试一次。

### 多份在线简历（0007）

SQL Editor 运行 `supabase/migrations/0007_multi_resume.sql`（可重复运行，要在 0005 之后）。它会创建 `resume_doc` 表，把旧版每人一份的简历搬过去，并加上份数上限：免费版 1 份，付费订阅最多 3 份。上限只由平台控制，浏览器扩展本身免费、不设限：扩展只会收到平台同步过来的简历，有多份时在扩展弹窗里选用哪一份填表。想改份数，要同时改 `packages/shared/src/plans.ts` 的 `resumes` 和 0007 里的数字。

### 附件简历、投递看板、会员等级（0005）

SQL Editor 运行 `supabase/migrations/0005_attachments_board.sql`（可重复运行）。它会创建 `attachment`、`board_item`、`app_settings` 表，数量上限触发器，以及私有存储桶 `resumes` 及其存储策略。运行后到 Supabase 的 Storage 页面确认 `resumes` 桶存在且是 **Private**。

### 支付（0012，支付宝沙箱先跑通）

现在先在 Vercel + Supabase 上用**支付宝沙箱**把付款到账的整条链路跑通；拿到营业执照、迁到国内云并完成 ICP 备案后，再换成正式应用。沙箱不需要营业执照，也不收真钱。

1. **建表**：SQL Editor 运行 `supabase/migrations/0012_pay_orders.sql`（可重复运行，要在 0004 之后）。它创建订单表 `pay_order` 和履约函数 `fulfill_order`：在一个事务里把订单改成已支付并发放权益，同一单只发一次。
2. **沙箱应用**：登录 [支付宝开放平台](https://open.alipay.com) → 控制台 → 沙箱。记下沙箱的 **APPID**；接口加签方式选“系统默认密钥”或自定义 RSA2 密钥，拿到**应用私钥**和**支付宝公钥**（不是应用公钥）。沙箱页面还会给一个**沙箱买家账号**，付款时用它登录。
3. **环境变量**（Vercel → Settings → Environment Variables，或本机 `.env`）：
   - `BILLING_ENABLED=1`、`SUPABASE_SERVICE_KEY`（计费本来就需要）
   - `PAYMENT_ENABLED=1`
   - `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`（带不带 `-----BEGIN` 头都行）
   - `ALIPAY_GATEWAY` 不填即沙箱网关
   - `PAY_PUBLIC_ORIGIN`：线上站点地址，支付宝异步通知打到 `<地址>/api/pay/notify/alipay`
4. **验证**：登录 → 账户页“会员与购买” → 买一个“Plus 一个月” → 跳到支付宝沙箱收银台，用沙箱买家账号付款 → 自动回到账户页，几秒内显示“支付成功，权益已到账”，等级和额度随之变化。

说明：

- **金额只认服务端**：下单接口只接收商品 id，价格和权益来自 `packages/shared/src/plans.ts` 的商品目录；履约时数据库函数再核对订单上的商品和金额。
- **到账有两条路**：支付宝异步通知（要能从公网访问，本机 localhost 收不到），以及回到网站后订单页主动向支付宝查单。任一条确认支付即履约，重复确认不会重复发放。
- **续期 / 升级**：同等级续期顺延到期日并累加额度；升级从付款时起算，旧等级没用完的额度带过去；会员有效期内不能买更低等级。不自动续费。
- **还没做**：退款（目前用管理员命令手动处理）、每日对账、发票、微信支付（需要已认证服务号和备案域名，没有沙箱）。
- 删除账号会连同订单记录一起删除；正式收费后，财务记录可能需要按规定保留一段时间，上线前请确认。

## 七、上线前自检

- [ ] `.env` 没有被提交（`git status` 里看不到它）。
- [ ] `service_role` 密钥只出现在本机 `.env` 和 GitHub Secrets 里。
- [ ] 线上页面能看到已审核的岗位，看不到待审核的。
- [ ] 已运行 `0003_user_data.sql`，Email OTP Length 为 6，Confirm signup / Reset Password 模板含 `{{ .Token }}`，并配置了自己的 SMTP；能用真实邮箱完成登录。
- [ ] 开启计费时：`0004` 已运行，`SUPABASE_SERVICE_KEY` 仅设在服务端，未登录用站点模型会被拒绝，额度不足返回 402。
- [ ] 已运行 `0007`，免费账号只能建 1 份在线简历，开通会员后能建到 3 份；扩展弹窗里能选用哪一份。
- [ ] 已运行 `0006`，免费账号每月能用 3 次站点模型，第 4 次提示额度用完。
- [ ] 已运行 `0005`，Storage 里 `resumes` 桶是 Private；免费账号传第 2 份附件会被拒，开通会员后可传到 3 份。
- [ ] 隐私说明页（`/privacy`）打开正常，内容和你实际使用的大模型服务相符。
- [ ] 大模型服务商处已设置月度额度上限。
- [ ] 岗位只展示摘要并跳转官网投递；对外推广前，再核对各公司网站的使用条款与 `robots.txt`。
- [ ] 手机打开线上站点：`/manifest.webmanifest` 能访问，Chrome 开发者工具 Application 面板里 Service Worker 是 activated；用 iPhone Safari “添加到主屏幕”后从图标打开是全屏、进入投递看板。

## 八、iPhone 上使用（PWA）

网页端是 PWA，iPhone 用户可以用 Safari 的“分享 → 添加到主屏幕”把它当 App 用（使用说明见 README）。不需要苹果开发者账号，也不需要 APP 备案；部署到 Vercel 不用额外配置，只要满足：

- **必须是 HTTPS**（Vercel 默认就是）。Service Worker 在 `http://` 上只有 `localhost` 能注册。
- 相关文件：`apps/web/app/manifest.ts`（生成 `/manifest.webmanifest`）、`apps/web/public/sw.js`（手写的 Service Worker）、`apps/web/public/offline.html`（离线提示页）、`apps/web/public/icons/`（192 / 512 图标和可遮罩图标，由 `app/icon.png` 缩放生成）、`apps/web/components/PwaClient.tsx`（注册 SW、“添加到主屏幕”提示）。
- `next.config.mjs` 给 `/sw.js` 加了 `Cache-Control: no-cache`，发版后手机会尽快拿到新的 SW。
- **缓存规则**：只缓存 `/_next/static` 下带哈希的构建产物、图标和 logo（先读缓存），以及离线提示页。`/api/*` 永远不经过缓存（登录后的个人数据、岗位数据）；页面 HTML 也不缓存，页面跳转先走网络，断网时显示离线页。规则写在 `sw.js` 的 `strategyFor` 里，`apps/web/lib/pwa.test.ts` 有测试。改了规则或离线页，把 `sw.js` 里的 `VERSION` 加一，旧缓存会在新版本激活时清掉。
- 开发环境（`npm run dev`）不注册 SW，避免热更新拿到旧代码。要在本机试离线效果，用 `npm run build -w @offerpilot/web && npm run start -w @offerpilot/web`。
- 如果要彻底撤掉 SW：把 `sw.js` 换成只做 `self.registration.unregister()` 的版本发一次，不要直接删文件（已安装的手机会一直用旧的）。

### 以后接推送提醒（Web Push）

iOS 16.4 起，**已添加到主屏幕**的 PWA 支持 Web Push（在 Safari 标签页里不行）。接入步骤：

1. 生成 VAPID 密钥对（如 `npx web-push generate-vapid-keys`），公钥放 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`，私钥只放服务端环境变量。
2. 新建 `push_subscription` 表（用户 id、endpoint、p256dh、auth，开行级安全），加 `POST/DELETE /api/me/push` 保存和删除订阅。
3. 前端在设置里放一个“开启提醒”按钮：**必须由用户点击触发** `Notification.requestPermission()`，再 `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`，把订阅发到上面的接口。iOS 上只在从主屏幕打开时才有 `PushManager`，在 Safari 里要先引导添加到主屏幕。
4. `sw.js` 里加 `push` 事件（`self.registration.showNotification(...)`）和 `notificationclick` 事件（打开 `/board`）。
5. 服务端在需要提醒时（笔试 / 面试临近、长时间没进展、HR 回复）用 `web-push` 之类的库发送；返回 404/410 的订阅要删掉。可以挂在现有的 GitHub Actions 定时任务里。
6. 隐私说明页补上“推送提醒”一节：发什么、多久发、怎么关。
