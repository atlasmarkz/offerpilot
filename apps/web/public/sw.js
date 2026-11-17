/*
 * OfferPilot 的 Service Worker：手写，不依赖构建工具。
 *
 * 只缓存两类东西：
 * - 静态资源：/_next/static 下带哈希的构建产物、图标、logo（先读缓存，没有再走网络）；
 * - 页面外壳：离线提示页 /offline.html（安装时预先缓存）。
 * /api/* 一律不经过缓存——里面是登录后的个人数据和岗位数据。
 * 页面 HTML 也不缓存：页面里的数据都靠 /api 拉，断网时缓存的旧页面什么也显示不了，
 * 所以页面跳转先走网络，断网时显示 /offline.html。
 *
 * 改了这个文件里的缓存规则或离线页，把 VERSION 加一，旧缓存会在新版本激活时清掉。
 */
const VERSION = "v1";
const STATIC_CACHE = `op-static-${VERSION}`;
const SHELL_CACHE = `op-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];
/** 每次发版都会产生新的哈希文件，留个上限，超出就删最早的 */
const STATIC_MAX = 300;

/**
 * 一个请求该怎么处理："skip" 不拦截（照常走网络）、"static" 先读缓存、"page" 先走网络失败给离线页。
 * 单独写成函数是为了能在 lib/pwa.test.ts 里直接测。
 */
function strategyFor(url, req) {
  if (req.method !== "GET") return "skip";
  let u;
  try {
    u = new URL(url);
  } catch {
    return "skip";
  }
  if (u.origin !== self.location.origin) return "skip";
  const p = u.pathname;
  // 个人数据和岗位数据：任何情况都不缓存
  if (p === "/api" || p.startsWith("/api/")) return "skip";
  if (req.mode === "navigate") return "page";
  // App Router 的 RSC 数据请求跟着页面走，不缓存
  if (u.searchParams.has("_rsc") || (req.headers && req.headers.rsc)) return "skip";
  if (p.startsWith("/_next/static/")) return "static";
  if (p.startsWith("/icons/") || /^\/(logo|logo-dark|icon|apple-icon)\.png$/.test(p)) return "static";
  return "skip";
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - STATIC_MAX))) await cache.delete(k);
}

async function networkFirstPage(request) {
  try {
    return await fetch(request);
  } catch {
    // 只有网络本身失败才给离线页；服务端返回的 4xx/5xx 原样显示
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("网络已断开", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("op-") && n !== STATIC_CACHE && n !== SHELL_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const kind = strategyFor(req.url, { method: req.method, mode: req.mode, headers: { rsc: req.headers.get("RSC") || "" } });
  if (kind === "static") event.respondWith(cacheFirst(req));
  else if (kind === "page") event.respondWith(networkFirstPage(req));
});

// 推送通知（Web Push）以后接在这里：self.addEventListener("push", …) 和 "notificationclick"，见 DEPLOY.md
