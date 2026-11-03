# 发布到 Microsoft Edge 加载项商店

Edge 加载项商店的开发者注册**据我所知是免费的**（以注册页面显示为准）。扩展包、文案、截图都已备好，下面是提交清单。**注册账号、验证身份、点击提交必须由你本人完成。**

扩展基于 Chromium，Edge 能直接运行同一个 zip，并且已在真实的 Microsoft Edge 里验证过：网页同步、弹窗、示例画像试用、注入并填表。

## 0. 提交前先确认

1. **网站已部署最新代码**：这次新增了公开页面 `https://offerpilot-rose.vercel.app/demo-form`（示例投递表单），审核人员要用它测试。推送到 `main` 后等 Vercel 部署完成，浏览器打开这个地址，应看到一个示例表单。
2. **隐私说明页可公开访问**：`https://offerpilot-rose.vercel.app/privacy` 能打开，里面有“浏览器扩展”一节。
3. 域名是写死在扩展包里的（`offerpilot-rose.vercel.app`）。如果要换域名，告诉我，用新域名重新打包。

## 1. 注册

1. 打开 Microsoft Edge 加载项开发者页面（在 Microsoft Partner Center 里，搜索 “Microsoft Edge Add-ons developer” 或 “Edge extensions Partner Center”），用 Microsoft 账号登录。
2. 选择账号类型：个人 / 公司。个人账号一般只需基本资料。
3. 填写开发者信息，验证邮箱。
4. 如果被问到是否为“商家（trader）”：这是欧盟消费者保护法的申报，按真实情况选，判断方法和 Chrome 那边一样（打算收费、属于经营行为选商家；纯个人小工具选非商家）。

## 2. 扩展包

文件：`offerpilot-extension-1.0.0-chrome.zip`（我已发给你；也可以自己生成）：

```bash
cd apps/extension
WXT_WEB_ORIGIN=https://offerpilot-rose.vercel.app npx wxt zip
```

产物在 `apps/extension/.output/`。包里的 manifest 只有 `storage`、`activeTab`、`scripting` 三项权限，没有任何网站的常驻访问权限。

## 3. 创建扩展并填写

在后台点 “Create new extension” → 上传 zip → 按页面依次填写。

### 可用性（Availability）
- 可见性：第一次建议选 **Hidden（隐藏）**，拿到链接自己装一遍确认没问题，再改成 Public。
- 市场：按需选择，不确定就选全部。

### 属性（Properties）
| 项 | 填写 |
|---|---|
| 类别 | 效率（Productivity） |
| 隐私政策链接 | `https://offerpilot-rose.vercel.app/privacy` |
| 网站 | `https://offerpilot-rose.vercel.app` |
| 支持联系方式 | 你的支持邮箱或网址（你可以用之前建的 OfferPilot 邮箱） |
| 是否使用远程代码 | 否 |
| 是否包含成人内容 | 否 |

### 商店列表（Store listings）→ 添加语言：中文（简体）

**名称**：OfferPilot 校招填表助手

**描述**（要求至少 250 个字符，下面这段约 450 字）：

```
OfferPilot 校招填表助手，配合 OfferPilot 网站使用，帮你在各公司的校招投递页里，一键填入重复的基础信息。

【怎么用】
1. 在 OfferPilot 网站填写或导入你的求职画像，点“同步到浏览器扩展”。
2. 打开公司的投递页，点击浏览器工具栏里的扩展图标，再点“填写当前页面”。
3. 检查填好的内容，自己点击提交。
没有账号也可以先体验：点扩展图标里的“用示例画像试用”，再到 OfferPilot 网站的“示例表单”页试一试。

【它会做什么】
• 按表单的字段标签，识别并填入：姓名、毕业院校、专业、学历、毕业年份。
• 学历是下拉框时自动选择；自定义的下拉框、日期选择器会提示你手动选择。
• 页面上已经有内容的字段不会被覆盖。

【它不会做什么】
• 不会替你点击“提交”。
• 不会填写手机号、邮箱、证件号、密码，也不会上传文件。
• 遇到验证码、短信验证，会停下来交给你自己完成。
• 不会常驻读取任何网页：只在你点击扩展图标里的按钮时，对你当前这一个标签页运行一次。

【隐私】
你的画像只保存在你本机浏览器的扩展存储里，扩展自己不会向任何服务器发送数据。卸载扩展即清除。

网站：https://offerpilot-rose.vercel.app
```

**图片**
| 项 | 文件 |
|---|---|
| 商店图标（Store logo，300×300 PNG） | `docs/edge-store/store-logo-300x300.png` |
| 截图（1280×800，建议传 3 张） | `docs/edge-store/screenshot-1-before.png`、`screenshot-2-after.png`、`screenshot-3-safety.png` |
| 小宣传图（440×280，可选） | `docs/edge-store/promo-small-440x280.png` |

截图是在真实浏览器里加载扩展后拍的，表单是标明“演示用”的示例页，不是任何真实公司的页面。

**搜索词**（有数量和长度限制，按页面提示取前几个）：校招、简历、自动填表、投递、求职、应届生、实习

### 提交审核的备注（Notes for certification）
这一栏是写给审核人员的，**务必填**，否则他们没有账号测试不了。可直接粘贴：

```
测试无需注册账号：
1. 安装扩展后，浏览器打开 https://offerpilot-rose.vercel.app/demo-form （公开的示例投递表单，页面不会收集或发送任何内容）。
2. 点击工具栏里的 OfferPilot 扩展图标。因为还没有画像，弹窗里会出现“用示例画像试用”按钮，点击它载入一份虚构的示例画像。
3. 再点“填写当前页面”。预期结果：姓名、毕业院校、专业被填入；“学历”是自定义下拉，弹窗会提示需要手动选择；手机号不会被填写；页面不会被提交。

权限说明：
- storage：保存示例画像或用户从 OfferPilot 网站同步来的画像（仅本机）。
- activeTab + scripting：仅在用户点击弹窗里的“填写当前页面”时，向当前这一个标签页注入一次填表脚本。没有申请任何主机权限，不常驻读取任何网页。
- 扩展里有一个只匹配 https://offerpilot-rose.vercel.app/* 的内容脚本，用来接收网站“同步到浏览器扩展”发来的画像（只接受同源消息并校验数据结构）。
扩展不向任何服务器发送数据，不含远程代码。
```

## 4. 提交与之后

- 点提交，等审核邮件。审核时长不固定，被拒会写明原因。
- 通过后，把商店链接发给我，我加到网页端“同步到浏览器扩展”旁，让用户一键安装。
- 之后每次更新：`apps/extension/package.json` 的 `version` +1 → 重新 `wxt zip` → 在后台上传新程序包。

## 5. 自测清单（上传前，自己装一次）

1. 打开 `edge://extensions`，开启“开发人员模式”，“加载解压缩的扩展”，选解压后的 zip 目录。
2. 打开 `…/demo-form`，点扩展图标 → “用示例画像试用” → “填写当前页面”，应填好姓名、学校、专业。
3. 在扩展“详细信息”里确认“站点访问权限”没有“所有站点”。

## 已知局限（如实写给用户）

- 只有通用填表，复杂表单（自定义下拉、分步表单）可能需要手动补充；暂不填写经历、简答题、手机和邮箱。
