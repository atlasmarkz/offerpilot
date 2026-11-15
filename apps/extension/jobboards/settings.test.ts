import { ApplyRecord } from "@offerpilot/shared";
import { describe, expect, it } from "vitest";
import { LOG_MAX, appendLog, appliedKeys, since, toRecord } from "./applyLog";
import { HARD_DAILY_CAP, bumpToday, countToday, pickDelay, readSettings } from "./settings";

describe("readSettings", () => {
  it("defaults to off with conservative limits", () => {
    const s = readSettings(undefined);
    expect(s.consent).toBe(false);
    expect(s.channels).toEqual({ boss: false, liepin: false });
    expect([s.dailyCap, s.minIntervalSec, s.maxIntervalSec]).toEqual([60, 30, 90]);
  });
  it("clamps out-of-range numbers instead of discarding everything", () => {
    const s = readSettings({ consent: true, dailyCap: 9999, minIntervalSec: 1, maxIntervalSec: 5 });
    expect(s.consent).toBe(true);
    expect(s.dailyCap).toBe(HARD_DAILY_CAP);
    expect(s.minIntervalSec).toBe(15);
    expect(s.maxIntervalSec).toBe(15);
  });
});

describe("daily counter", () => {
  const now = new Date("2026-11-15T10:00:00");
  it("counts per channel and resets on a new day", () => {
    const a = bumpToday(undefined, "boss", now);
    const b = bumpToday(a, "boss", now);
    expect(countToday(b, "boss", now)).toBe(2);
    expect(countToday(b, "liepin", now)).toBe(0);
    expect(countToday(b, "boss", new Date("2026-11-16T08:00:00"))).toBe(0);
  });
});

describe("pickDelay", () => {
  it("stays inside the configured range", () => {
    expect(pickDelay({ minIntervalSec: 30, maxIntervalSec: 90 }, () => 0)).toBe(30_000);
    expect(pickDelay({ minIntervalSec: 30, maxIntervalSec: 90 }, () => 1)).toBe(90_000);
  });
});

describe("apply log", () => {
  const job = { channel: "boss" as const, externalId: "a", title: "前端", company: "某司", url: "https://www.zhipin.com/job_detail/a.html" };
  it("turns a job into a valid record and drops non-https links", () => {
    const r = toRecord(job, new Date("2026-11-15T02:00:00Z"))!;
    expect(ApplyRecord.parse(r)).toEqual(r);
    expect(toRecord({ ...job, url: "javascript:x" })!.url).toBe("");
  });
  it("dedupes, caps size, and filters by watermark", () => {
    const r1 = toRecord(job, new Date("2026-11-15T02:00:00Z"))!;
    const r2 = toRecord({ ...job, externalId: "b" }, new Date("2026-11-15T03:00:00Z"))!;
    let log = appendLog(appendLog([], r1), r1);
    log = appendLog(log, r2);
    expect(log).toHaveLength(2);
    expect(appliedKeys(log)).toEqual(new Set(["boss:a", "boss:b"]));
    expect(since(log, r1.applied_at)).toEqual([r2]);
    const big = Array.from({ length: LOG_MAX }, (_, i) => toRecord({ ...job, externalId: String(i) })!);
    expect(appendLog(big, r2)).toHaveLength(LOG_MAX);
  });
});
