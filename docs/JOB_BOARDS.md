# 招聘平台自动投递（Boss直聘、猎聘）设计

日期：2026-11-15。状态：第一期开发中。

## 目标

在官网投递之外，支持在 Boss直聘、猎聘等招聘平台上**全自动**投递（Boss 是“打招呼”，猎聘是“立即沟通 / 应聘”），
并在网页端的**投递总览**里统一查看官网 + 各平台的投递情况。

## 借鉴的开源项目（只借鉴设计，不复制代码）

| 项目 | 借鉴点 | 许可证 |
|---|---|---|
| loks666/get_jobs | 多平台统一配置；过滤不活跃 HR、薪资区间、公司黑名单；AI 按 JD 生成招呼语 | PolyForm Noncommercial（禁止商用） |
| Ocyss/boss-helper | 扩展形态；按薪资 / 公司 / 岗位名 / 规模 / JD 内容多级过滤后批量投递 | 声明仅供学习交流、禁止商用 |
| criscool/boss-helper | 操作间隔（默认 60 秒）、每日沟通上限（默认 150）规避风控 | — |
| lastsunday/job-hunting | 在用户自己的页面上读取并留存职位，不做服务端爬取 | 禁止商用 |
| bosens-china/boss-outsourcing-tips | 外包识别：黑名单直接命中，关键词出现一次提示、两次认定 | — |

OfferPilot 有会员收费，以上禁止商用的项目**一行代码都不能拷**，下面的实现全部自己写。

### 从 get_jobs 学到的（2026-11-15 读了它的 Boss / 猎聘 worker）

| 做法 | 我们怎么用 | 状态 |
|---|---|---|
| 选择器集中在一个 `Locators` 里，2026-10 用真实页面核对过：`ul.rec-job-list li.job-card-box`、`a.job-name`、`span.boss-name`、`span.company-location`、`a.btn-startchat / a.op-btn-chat`、`.greet-boss-dialog`（留在此页 / 继续沟通） | 作为 `boss.ts` 的 `SEL` 的依据（只参考页面结构，不拷代码） | ✅ 已用，待亲自核对 |
| 调试模式：只遍历不投递 | “试运行”，默认开启，第一次先看会投哪些 | ✅ |
| HR 活跃描述含“年”就算不活跃 | `hrInactive()` | ✅ |
| 招聘者黑名单（按招聘者职位，如猎头） | `ScreenRules.recruiterBlacklist` | ✅ |
| 安全验证页地址：`/web/user/safe/verify-slider`、`/web/passport/zp/verify`、`/web/passport/zp/security` | `detectBlocker()`，遇到就停 | ✅ |
| 用首页搜索框搜索，而不是直接拼 URL 跳转，降低风控概率 | 现在是打开用户自己复制的搜索链接；改成模拟搜索放第二期 | ⏳ |
| 点卡片时读 `/wapi/zpgeek/job/detail.json` 的返回（字段全，薪资不是乱码） | 需要在页面主环境里挂监听，第二期再评估；现在读 DOM，薪资乱码时按“不限”处理 | ⏳ |
| 自定义 / AI 招呼语：点“继续沟通”进聊天页，往 `#chat-input` 写入再点发送；AI 判定不匹配就跳过 | 第二期：跨页面的状态机（列表页 → 聊天页发消息 → 回列表） | ⏳ |
| 重复沟通开关、发送图片简历 | 暂不做（对应届生用处不大，风险更高） | — |

## 为什么不用采集器爬

Boss、猎聘的职位要登录才能看，反爬很强，这和采集器“不处理登录、遵守 robots.txt”的原则冲突。
所以职位只在**用户自己已登录的标签页**里，由扩展读取，数据在本机处理；投递记录（公司、岗位名、链接、状态）
同步到用户自己的账号，用于投递总览。不读取、不上传聊天内容和 HR 个人信息。

## 架构

```
用户已登录的 Boss / 猎聘 标签页
  └─ 扩展 runner（content script，仅在用户开启的平台上运行）
       1. 平台适配器读职位列表 / 详情         apps/extension/jobboards/<platform>.ts
       2. 统一成 BoardJob                     packages/shared/src/jobBoard.ts
       3. 过滤流水线（纯函数，有单测）        packages/shared/src/jobBoard.ts → screenJob()
          关键词必含/排除 → 公司黑名单 → 外包识别 → 薪资 → 城市 → HR 活跃度 → 已投去重
       4. 生成招呼语（模板变量，只用简历里真实写过的内容）
       5. 执行器：每日上限、随机间隔、熔断   apps/extension/jobboards/runner.ts
       6. 写本机投递记录 applyLog             chrome.storage.local
  └─ 网页端打开“投递看板”时，bridge 把 applyLog 交给网页，网页上传到 /api/me/applications
网页端 /board：投递总览（官网看板 + 各平台记录）+ 原来的看板
```

### 权限

扩展现在没有任何网站的常驻权限。平台站点放在 `optional_host_permissions`，用户在弹窗里**开启某个平台时**才申请
（`zhipin.com`、`liepin.com`），商店安装页不会显示“读取所有网站”。开启后用 `chrome.scripting.registerContentScripts`
只在这两个域名注册 runner。

### 全自动的安全阀（默认值，用户可调小，不可调大到超过硬上限）

| 项 | 默认 | 硬上限 | 说明 |
|---|---|---|---|
| 每日投递数（每个平台） | 60 | 150 | Boss 自身每天约 150 次沟通上限 |
| 两次投递间隔 | 30–90 秒随机 | 不低于 15 秒 | |
| 连续失败熔断 | 3 次 | — | 连续 3 次读不到按钮 / 无响应就停 |
| 验证码、安全验证、“今日已达上限”、账号异常提示 | 立即停止 | — | 停下并通知用户，不尝试绕过 |
| 运行条件 | 标签页保持打开 | — | 不做后台无头浏览器，不导出 Cookie |

验证码和安全验证**永远交给用户**，这一条和官网填表一致。

### 风险提示（写进扩展的开启确认里）

自动投递违反 Boss 等平台用户协议的可能性很高，可能导致限流、降权或封号。用户开启前必须勾选知情。

## 数据

`application`（migration `0009_applications.sql`）：每条一个平台投递记录。

| 列 | 说明 |
|---|---|
| channel | `boss` / `liepin` / … |
| external_id | 平台职位 id，`(user_id, channel, external_id)` 唯一，重复上传幂等 |
| company / title / city / salary / url | 职位摘要 |
| status | `greeted`（已打招呼/已投）→ `replied`（HR 回复）→ `resume_sent` → `interview` → `offer` / `rejected` |
| applied_at / updated_at | |

官网投递仍在 `board_item`。投递总览把两者合在一起统计；平台记录量大，不占看板条数。

## 分期

1. **第一期**：过滤流水线、执行器、本机投递记录、云端同步、投递总览（本次）；Boss 适配器（选择器集中在一处，登录后实测校准）。
2. **第二期**：猎聘适配器；读平台“沟通列表”回写 HR 已读 / 已回复；AI 招呼语（复用站点额度）。
3. **之后**：实习僧、牛客（对应届生比智联、前程无忧更有用）。

## 未验证

- Boss、猎聘真实 DOM（需要登录），适配器里标注了“未实测”的选择器都要在浏览器里校准。
- Boss 的“今日沟通已达上限”和安全验证的确切文案。
