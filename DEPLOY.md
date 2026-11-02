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

1. 新建项目，记下 **Project URL**。
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
| `LLM_BASE_URL` `LLM_API_KEY` `LLM_MODEL` | 简历解析用；不填则该功能返回“未配置” |
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
| 大模型账单增长 | 简历解析是真金白银 | 调低每日上限；要求登录后才能用；换更便宜的模型 |
| 需要账号、投递看板、云端保存画像 | 免费档的 Supabase 够用，但要接入 Supabase Auth，`0001` 里的表就是为此设计的 | 开发工作，不一定要付费 |
| 数据库接近 500MB 或需要不暂停 | 现在约 4000 条岗位，只有几 MB | Supabase Pro（约 25 美元/月） |
| 采集量变大 | GitHub Actions 私有仓库超过 2000 分钟 | 仓库转公开，或租一台小服务器跑采集 |

按目前的规模（几千条岗位、少量用户），这条免费链路够用；真正会先花钱的通常是**大模型调用**，其次是商业化后的 Vercel 套餐。

## 五、上线前自检

- [ ] `.env` 没有被提交（`git status` 里看不到它）。
- [ ] `service_role` 密钥只出现在本机 `.env` 和 GitHub Secrets 里。
- [ ] 线上页面能看到已审核的岗位，看不到待审核的。
- [ ] 隐私说明页（`/privacy`）打开正常，内容和你实际使用的大模型服务相符。
- [ ] 大模型服务商处已设置月度额度上限。
- [ ] 岗位只展示摘要并跳转官网投递；对外推广前，再核对各公司网站的使用条款与 `robots.txt`。
