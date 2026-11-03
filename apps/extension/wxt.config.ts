import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "OfferPilot 校招填表助手",
    // 商店短描述上限 132 字符
    description: "自动识别飞书、Moka、北森等校招投递页并一键填入你的信息，缺什么提示你补。只填不提交，验证码由你自己完成。",
    // storage：保存你同步过来的画像；activeTab + scripting：仅在你点击图标时，向当前这一个标签页注入填表脚本
    permissions: ["storage", "activeTab", "scripting"],
    minimum_chrome_version: "109",
    action: { default_title: "填写当前页面" },
  },
  zip: { artifactTemplate: "offerpilot-extension-{{version}}-{{browser}}.zip" },
  hooks: {
    // 运行时注入的填表脚本，WXT 会把它的 matches 加进 host_permissions（*://*/*），
    // 那会让商店把扩展标成“可读取所有网站的数据”。activeTab 已经够用，所以去掉：
    // 扩展没有任何网站的常驻访问权限，只有同步脚本匹配你自己的网站。
    "build:manifestGenerated": (_wxt, manifest) => {
      delete manifest.host_permissions;
      // 仅用于自动化测试：测试构建额外授予本机地址的访问权限（自动化没法模拟“点击图标”触发 activeTab）。
      // 商店构建不会设置这个变量。
      if (process.env.WXT_TEST_HOSTS === "1") manifest.host_permissions = ["http://localhost/*", "http://127.0.0.1/*"];
    },
  },
});
