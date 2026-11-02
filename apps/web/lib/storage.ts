/** 浏览器本地存储的小工具：任何一步出错（隐私模式、被禁用）都只是不保存，不影响页面。 */
export function load<T>(key: string, fallback: T, store: "local" | "session" = "local"): T {
  try {
    const raw = (store === "local" ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown, store: "local" | "session" = "local"): void {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* 只是不保存 */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}

export const split = (s: string): string[] =>
  s
    .split(/[,，、\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function flip<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
