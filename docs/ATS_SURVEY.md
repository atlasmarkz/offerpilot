# 目标公司的投递系统调研

调研日期：2026-11-03。方法：请求各公司校招入口的公开页面，看页面引用的域名和脚本来判断所用系统；没有登录，也没有看投递表单本身。“自研”表示没发现第三方招聘系统的特征，也可能是供应商的定制版，不能完全排除。

## 第三方招聘系统

| 系统 | 公司 | 入口 / 依据 |
|---|---|---|
| 飞书招聘 | 字节跳动 | `jobs.bytedance.com`（爬虫已按飞书平台抓取） |
| | 蔚来 | `nio.jobs.feishu.cn` |
| | 小米 | `xiaomi.jobs.f.mioffice.cn`（飞书招聘白标域名） |
| | MiniMax | `vrfi1sk8a0.jobs.feishu.cn` |
| | 得物 | `poizon.jobs.feishu.cn`（`campus.dewu.com` 引用飞书招聘资源） |
| | 商汤 | `sensetime.jobs.feishu.cn` |
| | Momenta | `momenta.jobs.feishu.cn` |
| | 地平线 | `horizon.jobs.feishu.cn` |
| | 拓竹科技 | `bambulab.jobs.feishu.cn` |
| | 小鹏 | `xiaopeng.jobs.feishu.cn/campus` |
| | 理想 | `li.jobs.feishu.cn`，只找到社招入口，校招入口待找 |
| Moka | 知乎 | `app.mokahr.com/apply/zhihu` |
| | 九坤量化 | `app.mokahr.com/apply/ubiquantrecruit` |
| | 智元机器人、龙旗量化 | Moka 上有租户，但页面显示“已关停”，可能是往届批次，当前入口待找 |
| 北森 | 科大讯飞 | `campus.iflytek.com` 跳转 `iflytek.zhiye.com` |
| 大易 | 荣耀 | `career.honor.com` 跳转 `wecruit500.hotjob.cn` |

## 自研站点

百度 `talent.baidu.com/jobs/campus`、阿里系 `campus-talent.alibaba.com`、拼多多 `careers.pddglobalhr.com/campus`、滴滴 `talent.didiglobal.com/campus`、华为 `career.huawei.com`、OPPO `careers.oppo.com`、vivo `hr.vivo.com`、海康威视 `talent.hikvision.com`、大疆 `we.dji.com`；以及爬虫已适配的腾讯、美团、京东、网易、哔哩哔哩、小红书、米哈游、携程、同花顺。

## 未确认

- DeepSeek、智谱：官网只挂了飞书**表单**链接，不是招聘系统。DeepSeek 另有 `talent.deepseek.com`。
- 哈啰、虎鲸文娱、灵犀互娱、宇树、零跑（返回 403）、远景、宽德量化、佳期量化：没找到校招入口。
- 帆软：入口应为 `join.fanruan.com`，连接超时。

## 对扩展的影响

1. 飞书招聘覆盖 10 家公司，约 900 个岗位，最优先做半自动投递和进展同步。
2. Moka、北森、大易各只有 1 到 2 家，模板识别已有，深度适配放后面。
3. 自研站点按岗位数排：网易、美团、B 站、腾讯，再到其余。
4. 还没验证：投递表单结构、“提交成功”标志、“我的投递”页的状态文案。这些都要登录后在浏览器里实际看。

## 飞书招聘表单的实测记录（蔚来校招简历编辑页，2026-11-03）

- 表单项 `.ud-formily-item`，标签 `.ud-formily-item-label`；可重复区块 `.applyFormModuleWrapper-windows` 里是 `.apply-form-array-card`，“添加”是区块内文字为“添加”的按钮，点后新行同步出现。
- 下拉弹层的选项是 `.ud__select__list__item`（虚拟列表，不在表单项内）；用 mousedown / mouseup / click 事件可选中，页面状态随之更新、必填报错消失。
- 学历、学历类型是只读下拉；学校是 `ud__input` 外壳的搜索框（没有 `ud__select__selector`），输入后要等几百毫秒选项才出来，选中后值写进输入框。
- 起止时间是两个 `YYYY-MM` 文本输入框，用原生 setter 写值 + Enter + blur 可被页面接受。
- 上传“简历附件”只是存文件，不会解析回填表单。
- 未验证：获奖时间、自我评价、手机号（带区号）、其余飞书租户。
