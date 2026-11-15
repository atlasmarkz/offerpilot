# 岗位采集器（crawler）

把各公司校招官网上的岗位，统一成 `@offerpilot/shared` 里的 `Job` 结构，存入本地待审核队列。

## 用法

```bash
npm run crawl -w @offerpilot/crawler                       # 跑 sources.json 里所有启用的数据源
npm run crawl -w @offerpilot/crawler -- --only meituan-campus   # 只跑一个
npm run review -w @offerpilot/crawler -- list              # 查看待审核
npm run review -w @offerpilot/crawler -- approve <id前缀>  # 通过（审核后才对用户可见）
npm run review -w @offerpilot/crawler -- reject <id前缀>
npm run verify -w @offerpilot/crawler                      # 自动验证：每个数据源抽 5 个岗位真实打开投递页，通过率 ≥80% 就整组批准（--dry 只检查）
npm run review -w @offerpilot/crawler -- summary           # 按公司看审核进度
npm run review -w @offerpilot/crawler -- approve-company <companyId>   # 抽查后整家通过（只动待审岗位）
```

结果写在 `data/jobs.json`（已被 git 忽略）。新数据源的岗位入库是 `pending`，必须人工审核通过才会展示给用户；重复抓取不会改变已有岗位的审核状态。

## 每日更新与下架（`npm run recheck` 是新增的）

GitHub Actions（`.github/workflows/crawl.yml`）每天北京时间凌晨 3 点自动跑：`crawl` → `sync --keep-review` → `recheck`。数据库要先运行到 `0010_job_freshness.sql`。

| 字段 | 含义 |
|---|---|
| `source` | 数据源 id（`sources.json` 的 id），旧数据按 `sourceUrl` 自动补上 |
| `postedAt` | 官网上的发布日期；飞书招聘用 `publish_time`，其他平台从 `publishTime`、`refreshTime` 等常见字段里识别，识别不到就为空 |
| `firstSeenAt` / `lastSeenAt` | 第一次采集到 / 最近一次确认在招。网页上没有发布日期时显示“收录日期” |
| `status` / `closedAt` / `missCount` | 在招或已下架；连续几次没找到 |

规则（`packages/shared/src/freshness.ts`）：
- 每次采集会记下每个数据源是否**取全**（翻到最后一页、没被 `maxJobs` 截断、没中途出错、没有解析失败的条目），写在 `data/last-run.json`。
- 取全的数据源里，**连续两次**找不到的岗位标记下架；只差一次不下架，防止官网临时故障误判。再次出现自动恢复在招。
- 没取全的数据源（字节、蔚来、小米、腾讯只取前 300 条）不能这样判断，由 `recheck` 每天打开最久没确认的几个岗位详情页复查（默认每个数据源 8 个、超过 3 天没确认的），连续两次打不开才下架。
- 同步以数据库为准。新岗位：同一数据源之前已有岗位审核通过（整组抽查过）就直接上线，否则待审核；不会改动已经审核过的状态。新数据源仍按下面的流程在本机审核。

```bash
npm run recheck -w @offerpilot/crawler -- --per-source 8 --stale-days 3 [--dry]
```

依赖本机已安装的 Chrome（用 `playwright-core`，不下载浏览器）。结构化站点不需要大模型；只有 `platform: "generic"` 的网页类数据源才需要在根目录 `.env` 里配 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL`。

> **自动验证的边界**：只抽样核对“链接能打开且页面含岗位名”，不保证每个岗位都没下架；
> 网易互娱/互联网项目没有独立详情页，只确认页面能打开。岗位内容以官网为准，页面上也提示了这一点。

## 已支持的站点

| 数据源 | 平台适配器 | 说明 |
|---|---|---|
| 字节跳动 | `feishu` | 飞书招聘，约 6900 条，默认每次取 300 |
| 蔚来 | `feishu` | 校招入口 `/campus` |
| 小米 | `feishu` | 私有部署的飞书招聘 |
| MiniMax | `feishu` | 入口混有社招，用 `recruitTypes` 过滤出校招/实习 |
| 腾讯 | `tencent` | 列表页无职责/要求正文，硬条件为空 |
| 美团 | `meituan` | 校招、实习两个数据源 |
| 京东 | `jd` | 校招岗位 |
| 哔哩哔哩 | `bilibili` | 校招、实习两个数据源 |
| 网易 | `netease` | 互联网、互娱两个项目；**岗位没有独立详情页**，投递入口落在项目岗位列表（链接带 `#job-<id>`） |
| 网易日常实习 | `neteasehr` | hr.163.com，约 600 条，有独立详情页 |
| Jane Street | `janestreet` | 官方公开 JSON，只保留 New Grad 和实习（海外岗位，无硬条件） |
| 携程 | `ctrip` | 应届校招，约 50 条 |
| 同花顺 | `tonghuashun` | 校招 + 实习，约 110 条 |
| 小红书 | `xiaohongshu` | 2027 校招 |
| 米哈游 | `mihoyo` | 列表无职责/要求正文，硬条件为空，届别取自届别说明 |

2026-11-15 新增（共 34 家公司、约 1.2 万条在招的校招 / 实习岗位）：

| 类别 | 公司 | 平台 | 说明 |
|---|---|---|---|
| 大厂 | 阿里巴巴 | `alibaba` | 集团校招统一入口 434 条；实习批次未接 |
| | 拼多多 | `pdd` | 校招 36 条；实习入口地址待确认 |
| | OPPO | `oppo` | 244 条，带发布日期 |
| | vivo | `beisen` | 校招是自有域名的北森门户 |
| | 得物 | `feishu` | 飞书白标 `campus.dewu.com` |
| | 科大讯飞 | `beisen` | 校招 + 飞星 / 星火等专项计划 |
| 芯片 | 长江存储、长鑫存储、摩尔线程 | `beisen` | |
| 车企 | 零跑、长安 | `beisen` | |
| | 小鹏 | `feishu` | 613 条，取前 300（未取全，靠复查判下架） |
| | Momenta | `feishu` | 自动驾驶 |
| 硬件制造 | 拓竹、三一 | `feishu` / `beisen` | |
| 国央企 | 中国人寿、中国人保、中核集团、招商局集团 | `beisen` | 总部和各省分公司、成员单位，量大 |
| 金融 | 中金公司 | `beisen` | 目前开放的是“项目实习” |

**北森门户（`platform: "beisen"`）**：`<租户>.zhiye.com` 或自有域名。页面在无头浏览器里渲染不出来，但前端用的岗位列表接口 `POST /api/JobAd/GetJobAdPageList` 公开、robots.txt 允许，所以走 HTTP：先从首页 HTML 取 `PortalId`，再按每页 100 条翻完，按分类名只留校招 / 实习（校园招聘、实习生招聘、青苗、飞星、项目实习……）。同属北森的公司只需在 `sources.json` 加一项（`"platform": "beisen", "mode": "http"`）。⚠ 详情页地址（`/campus/detail?jobAdId=`、实习 `/intern/detail?jobAdId=`）按北森的常见格式拼，没能自动验证。

同属飞书招聘系统的公司，新增只需在 `sources.json` 加一项（`platform: "feishu"`），不用写代码。

### 暂未接入的主流公司（2026-11-15 调研）

| 公司 | 原因 |
|---|---|
| 国家电网、中石油、中国电信 | 返回 412（网站防爬保护），不绕过 |
| 国聘（央企招聘平台） | 岗位接口要求登录 / 权限（返回 403），不处理登录 |
| 华为 | 页面能用，直接调接口 403；需要改用浏览器拦截的方式，下一步 |
| 百度、滴滴、蚂蚁 | 无头浏览器里页面空白或没有列表接口 |
| 比亚迪、吉利、长城、上汽、中国移动、工行、建行 | 首页连接失败或超时，入口待确认 |
| 荣耀、大疆 | 大易（hotjob）系统，还没写适配器 |
| 中芯国际、紫光展锐、海光、寒武纪、豪威、兆易 | 没找到可用的校招入口 |
| 商汤、理想 | 飞书入口只有社招 |
| 中船集团、中国建筑 | 北森域名下是别的系统，接口不通 |
| 快手 | robots.txt 禁止抓取 |

## 硬条件抽取

结构化站点用规则从“任职要求”里抽（`src/requirements.ts`）：毕业届别、最低学历、专业、院校标签。
原则是**宁可留空也不猜**：空表示“未识别”，匹配时视为无限制。政治面貌、户籍目前不抽取。

## 新增一个站点

1. 用发现工具找到岗位列表接口和翻页控件：
   ```bash
   npm run discover -w @offerpilot/crawler -- <列表页url> ["要点击的文字,另一个文字"]
   ```
   `DISCOVER_ALL=1` 会打印页面上所有 JSON 请求。
2. 在 `src/platforms/` 新建适配器，用 `paginatedSource` 描述：哪个响应是列表、怎么解析、下一页按钮、怎么映射成岗位（参考 `meituan.ts`，约 50 行）。
3. 在 `sources.ts` 的 `platform` 枚举和 `createSource` 里登记，在 `sources.json` 加配置。
4. **务必验证详情链接**：打开 `applyUrl`，确认页面真的是这个岗位，再启用。

## 礼貌与合规

- 抓取前检查 robots.txt，被禁止则直接报错，不绕过。
- 同一主机限速（默认间隔 2 秒），带可识别的 User-Agent。
- 不处理登录、验证码；遇到会直接失败并记录原因。
- 单个数据源失败不影响其他数据源；翻页中途出错会保留已取得的数据。

## 已知限制

- 每个数据源每次最多取 `maxJobs` 条（默认 300），尚未做增量更新。
- 腾讯列表没有岗位正文，硬条件为空。
- 理想、小鹏：没找到校招入口，已停用。
- 没有独立校招站的公司（多数 AI 创业公司、量化、机器人）需要“公告录入”，尚未实现。
- 阿里：校招/实习入口当前没有在招岗位（返回 0 条），新批次开放后再接。
- 快手：robots.txt 禁止抓取，按合规原则不接入。
- 百度、荣耀、科大讯飞、商汤等站点页面空白或被拦，未接入；OPPO 等还没找到可用的岗位列表接口。
- 科大讯飞（zhiye.com）、地平线（hotjob.cn）：点击后没有触发岗位接口，尚未摸清。
- 华为、蚂蚁、OPPO：校招页没有触发岗位列表接口（可能未开放或需登录），尚未接入。
- 滴滴：岗位接口返回加密数据，页面自行解密；不去破解，要接只能走渲染后的页面，暂缓。
