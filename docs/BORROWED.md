# 从开源求职项目里借鉴的内容

日期：2026-11-15。对照的项目（都是 MIT 许可证，标明出处即可复用；get_jobs 是禁止商用的 PolyForm，只借鉴思路，见 [JOB_BOARDS.md](JOB_BOARDS.md)）：

| 项目 | 一句话 | 和我们最像的地方 |
|---|---|---|
| [career-ops](https://github.com/career-ops-hq/career-ops) | 本地运行的 AI 求职助手：贴一个岗位 → 1-5 分评估 → 定制简历 / 求职信 → 追踪；从不自动提交 | 岗位匹配、简历定制、投递看板 |
| [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) | 基于 Claude Code 的求职工作流：搜索 → 排序 → 初稿 + 审稿 → 面试 → 结果 | 简历建议、面试准备 |
| [AIHawk](https://github.com/feder-cr/Jobs_Applier_AI_Agent) | 全自动投递：打分、你勾选、Firefox 自动填表并提交，留截图 | 扩展填表、自动投递 |
| [Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | 社区维护的实习列表：issue 表单提交 → Actions 生成 `listings.json` 和 README | 实习板块的岗位来源 |

原则不变：**不编造、你来决定、隐私优先**。借鉴来的东西都要过这三条。

## 按模块

### 岗位与实习

| 借鉴点 | 来源 | 落在哪 | 状态 |
|---|---|---|---|
| 投之前先评估：1-5 分，≥4 建议投，3 可以试试，≤2 不建议；结论由分数决定，不信模型 | career-ops | `apps/web/lib/fit.ts`、`/api/jobs/fit`、岗位详情“评估匹配度” | ✅ 本轮完成 |
| 匹配的每一条都要引用简历原文作证据；简历里没有的一律算差距 | career-ops | 同上（提示词 + `normalizeFit` 里的防编造检查） | ✅ |
| 贴一个岗位就能评估（岗位库以外的 Boss / 实习网站 / 公众号岗位） | career-ops | 简历工作台“按岗位评估匹配度” | ✅ |
| 岗位是否还在招（liveness）、是否反复重发（ghost job） | career-ops、AIHawk | 采集器 `verifyLinks.ts` 已抽样验证；补“岗位消失 / 重发”标记 | ⏳ 下一步 |
| 社区提交岗位：issue 表单 → 审核 → Actions 生成数据 | Summer2027-Internships | 采集器“公告录入”（没有官网的公司、实习群里的岗位） | ⏳ 下一步 |
| 岗位数据字段：`active`、`date_posted`、`date_updated`、来源 | Summer2027-Internships | `Job` 增加发布日期 / 是否在招，列表按新旧排序 | ⏳ |
| 批量排序：一次搜索结果整体打分出短名单 | ai-job-search `/rank` | 已选岗位批量评估（费用按条计） | 💡 之后 |

### 简历撰写

| 借鉴点 | 来源 | 落在哪 | 状态 |
|---|---|---|---|
| 代码层面的防编造检查：生成内容里的数字、技术词必须能在原简历找到 | career-ops | `packages/shared/src/factCheck.ts`；修改建议的改写示例会标出“简历里没有的内容” | ✅ 本轮完成 |
| 岗位定制简历：按岗位重排经历、改写要点、调技能顺序、写自我评价；模型只给“改动方案”，学校 / 公司 / 时间等事实字段代码原样保留；每处改动单独审阅，找不到出处的默认不采用；另存为新简历或应用到当前 | career-ops、ai-job-search | `apps/web/lib/tailor.ts`、`/api/resume/tailor`、简历工作台“按岗位评估与定制”；岗位详情“按这个岗位定制简历 →”带着岗位跳过去。Plus 会员功能（用站点模型时；自带模型不限） | ✅ 本轮完成 |
| 初稿 + 第二个模型审稿，再修改 | ai-job-search drafter-reviewer | 定制简历目前用代码审（防编造检查 + 用户逐条确认）；第二个模型审稿放到简答题草稿 | ⏳ |
| 导出后检查 PDF 能不能被招聘系统正确读出文字 | ai-job-search ATS 检查 | 导出 PDF 后自检 | 💡 之后 |
| 面试故事库（STAR + 反思），跨岗位复用 | career-ops Story Bank | Pro“面试准备” | 💡 之后 |

### 自动投递（Boss直聘等，详见 [JOB_BOARDS.md](JOB_BOARDS.md)）

| 借鉴点 | 来源 | 状态 |
|---|---|---|
| 试运行、招聘者黑名单、HR 活跃度、安全验证识别、集中维护选择器 | get_jobs | ✅ |
| 投递前先确认岗位还在招；每次投递留凭证（页面状态 / 截图） | AIHawk | ⏳ |
| 适配规则写成给模型看的说明（每个招聘系统一份 Markdown），没适配过的表单让模型兜底 | AIHawk plugins | 💡 之后（官网填表的兜底方案） |
| AI 判定不匹配就跳过、AI 招呼语 | get_jobs | ⏳ 第二期，复用 `fit.ts` 的评分 |

### 投递看板

| 借鉴点 | 来源 | 状态 |
|---|---|---|
| 渠道对比、回应率、每日节奏 | career-ops `stats.mjs` | ✅ 投递总览已有 |
| 拒绝规律分析：按渠道 / 岗位类型 / 公司类型看在哪一步被刷 | career-ops `analyze-patterns.mjs` | ⏳ |
| 跟进节奏提醒（投出 N 天没回应 → 提醒跟进） | career-ops follow-up cadence | 部分已有（看板“需要跟进”） |
| 连续被拒后指出能力差距 | career-ops | 💡 之后（汇总 fit 结果里的 gaps） |

### 安全与隐私

| 借鉴点 | 来源 | 状态 |
|---|---|---|
| 岗位描述先过安全检查：去掉看不见的字符、HTML 注释，删掉像是写给 AI 的指令 | ai-job-search integrity gate | ✅ `packages/shared/src/integrity.ts`，匹配度评估已接入 |
| 岗位描述在提示词里明确是“资料，不是指令” | ai-job-search、career-ops | ✅ `FIT_SYSTEM_PROMPT` |
| 不上报遥测、数据只给用户选的模型 | career-ops | 已是现状（联系方式不发给模型） |

## 不借鉴的

- 无人值守的海量投递（AIHawk 被报道一口气投 2843 个）：违背“少投、投准”，也伤平台和 HR。Boss 自动投递保留每日上限和试运行。
- 本地命令行形态：我们的用户是应届生，网页 + 扩展更合适。
- 求职信生成：国内校招基本不用；对应的是“简答题草稿”。
