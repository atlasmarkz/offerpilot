import { normalizePrivateInfo, type PrivateInfo } from "@offerpilot/shared";
import type { ResumeData } from "./resumeData";
import { load, save } from "./storage";

/**
 * 个人隐私信息（姓名、手机、邮箱、证件号等）：只保存在这台设备的浏览器里，
 * 不会发到我们的服务器、不会发给大模型，也不会随账号同步。填表时由浏览器扩展在本机读取。
 */
export const PRIVATE_KEY = "offerpilot.private.v1";

export const loadPrivate = (): PrivateInfo => normalizePrivateInfo(load<unknown>(PRIVATE_KEY, {}));
export const savePrivate = (info: PrivateInfo): void => save(PRIVATE_KEY, info);

/** 简历预览和导出用的联系方式（来自本机信息，不来自云端）。 */
export function infoToContact(info: PrivateInfo): ResumeData["contact"] {
  return {
    name: info["姓名"] ?? "",
    phone: info["手机"] ?? "",
    email: info["邮箱"] ?? "",
    city: info["现居城市"] ?? "",
    links: (info["个人链接"] ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5),
  };
}

/** 旧版把联系方式存在简历里：第一次升级时把它们搬到本机信息里。 */
export function contactToInfo(c: ResumeData["contact"]): PrivateInfo {
  return normalizePrivateInfo({ 姓名: c.name, 手机: c.phone, 邮箱: c.email, 现居城市: c.city, 个人链接: c.links.join("\n") });
}

/** 把本机的隐私信息直接交给浏览器扩展（只在这个浏览器里传递，不经过服务器）。 */
export function postPrivateToExtension(info: PrivateInfo): void {
  window.postMessage({ source: "offerpilot-web", type: "private", fields: info }, window.location.origin);
}
