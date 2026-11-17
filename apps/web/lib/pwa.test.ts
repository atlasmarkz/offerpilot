import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { installHint, isIos, isWeChat, type HintState } from "./pwa";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

describe("isIos", () => {
  it("认出 iPhone", () => expect(isIos({ userAgent: IPHONE })).toBe(true));
  it("认出伪装成 Mac 的 iPad", () => expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true));
  it("真的 Mac 不算", () => expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false));
  it("安卓不算", () => expect(isIos({ userAgent: ANDROID, platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(false));
  it("认出微信内置浏览器", () => {
    expect(isWeChat(`${IPHONE} MicroMessenger/8.0.50(0x18003231) NetType/WIFI Language/zh_CN`)).toBe(true);
    expect(isWeChat(IPHONE)).toBe(false);
  });
});

describe("installHint", () => {
  const base: HintState = { standalone: false, dismissed: false, ios: false, canPrompt: false, touch: true };
  it("iOS 给分享引导", () => expect(installHint({ ...base, ios: true })).toBe("ios"));
  it("有安装事件的触屏浏览器给安装按钮", () => expect(installHint({ ...base, canPrompt: true })).toBe("prompt"));
  it("电脑上不提示", () => expect(installHint({ ...base, canPrompt: true, touch: false })).toBe("none"));
  it("没有安装事件也不是 iOS 就不提示", () => expect(installHint(base)).toBe("none"));
  it("已经从主屏幕打开就不提示", () => expect(installHint({ ...base, ios: true, standalone: true })).toBe("none"));
  it("关过就不再提示", () => expect(installHint({ ...base, canPrompt: true, dismissed: true })).toBe("none"));
});

// Service Worker 是 public/ 下的普通脚本，这里在沙箱里加载它，只检查缓存策略的路由
describe("sw.js 缓存策略", () => {
  const code = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const ctx: Record<string, unknown> = { self: { addEventListener() {}, location: { origin: "https://offerpilot.example" } }, URL };
  runInNewContext(code, ctx);
  const strategyFor = ctx.strategyFor as (url: string, req: { method: string; mode: string; headers?: Record<string, string> }) => string;
  const get = (url: string, mode = "cors", headers: Record<string, string> = {}) => strategyFor(url, { method: "GET", mode, headers });
  const O = "https://offerpilot.example";

  it("绝不缓存 /api/*，包括页面跳转和带参数的请求", () => {
    expect(get(`${O}/api/me/board`)).toBe("skip");
    expect(get(`${O}/api/jobs?city=上海`)).toBe("skip");
    expect(get(`${O}/api/auth/me`, "navigate")).toBe("skip");
    expect(get(`${O}/api`)).toBe("skip");
  });
  it("非 GET 和别的域名不管", () => {
    expect(strategyFor(`${O}/board`, { method: "POST", mode: "navigate" })).toBe("skip");
    expect(get("https://cdn.example.com/x.js")).toBe("skip");
  });
  it("构建产物和图标先读缓存", () => {
    expect(get(`${O}/_next/static/chunks/main-abc123.js`)).toBe("static");
    expect(get(`${O}/icons/icon-192.png`)).toBe("static");
    expect(get(`${O}/logo.png`)).toBe("static");
  });
  it("页面跳转先走网络，断网时给离线页", () => {
    expect(get(`${O}/board`, "navigate")).toBe("page");
    expect(get(`${O}/app?q=前端`, "navigate")).toBe("page");
  });
  it("App Router 的 RSC 数据请求不缓存", () => {
    expect(get(`${O}/board?_rsc=abc`)).toBe("skip");
    expect(get(`${O}/board`, "cors", { rsc: "1" })).toBe("skip");
  });
  it("开发环境的热更新不碰", () => {
    expect(get(`${O}/_next/webpack-hmr`)).toBe("skip");
  });
});
