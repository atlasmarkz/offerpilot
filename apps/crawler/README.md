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

结果写在 `data/jobs.json`（已被 git 忽略）。**所有岗位入库都是 `pending`**，必须人工审核通过才会展示给用户；重复抓取不会改变已有岗位的审核状态。

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

同属飞书招聘系统的公司，新增只需在 `sources.json` 加一项（`platform: "feishu"`），不用写代码。

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
