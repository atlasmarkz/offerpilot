import { describe, expect, it } from "vitest";
import { assertSafeBaseUrl, isPrivateAddress, parseJsonLoose, userConfig } from "./llmConfig";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertSafeBaseUrl", () => {
  const strict = { allowPrivate: false };
  it("rejects non-https, internal hosts and malformed urls in strict mode", async () => {
    await expect(assertSafeBaseUrl("http://api.example.com/v1", strict)).rejects.toThrow(/https/);
    await expect(assertSafeBaseUrl("https://localhost:11434/v1", strict)).rejects.toThrow(/内网/);
    await expect(assertSafeBaseUrl("https://127.0.0.1/v1", strict)).rejects.toThrow(/内网/);
    await expect(assertSafeBaseUrl("https://169.254.169.254/latest", strict)).rejects.toThrow(/内网/);
    await expect(assertSafeBaseUrl("https://[::1]/v1", strict)).rejects.toThrow(/内网/);
    await expect(assertSafeBaseUrl("https://user:pw@8.8.8.8/v1", strict)).rejects.toThrow(/用户名/);
    await expect(assertSafeBaseUrl("not a url", strict)).rejects.toThrow(/格式/);
  });
  it("accepts a public https IP and strips the trailing slash", async () => {
    expect(await assertSafeBaseUrl("https://8.8.8.8/v1/", strict)).toBe("https://8.8.8.8/v1");
  });
  it("allows localhost over http when private urls are allowed (local dev)", async () => {
    expect(await assertSafeBaseUrl("http://localhost:11434/v1", { allowPrivate: true })).toBe("http://localhost:11434/v1");
  });
});

describe("userConfig", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k];
  it("returns undefined when nothing is filled in", async () => {
    expect(await userConfig(get({}))).toBeUndefined();
  });
  it("rejects a partly filled config", async () => {
    await expect(userConfig(get({ llmBaseUrl: "https://8.8.8.8/v1" }))).rejects.toThrow(/不完整/);
  });
  it("returns a trimmed full config", async () => {
    const c = await userConfig(get({ llmBaseUrl: " http://localhost:1234/v1/ ", llmApiKey: " k ", llmModel: " m " }));
    expect(c).toEqual({ baseUrl: "http://localhost:1234/v1", apiKey: "k", model: "m" });
  });
});

describe("parseJsonLoose", () => {
  it("extracts JSON wrapped in a code fence", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("ignores a reasoning model's <think> block, even with braces inside", () => {
    expect(parseJsonLoose('<think>先想想 {不是json} 吧</think>\n{"a":2}')).toEqual({ a: 2 });
  });
  it("throws on non-JSON", () => {
    expect(() => parseJsonLoose("抱歉")).toThrow(/无法解析/);
  });
});
