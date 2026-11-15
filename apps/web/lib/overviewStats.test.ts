import { describe, expect, it } from "vitest";
import type { Application } from "./applications";
import type { BoardItem } from "./board";
import { overview, unify } from "./overviewStats";

const now = new Date("2026-11-15T12:00:00");

const board = (o: Partial<BoardItem>): BoardItem => ({
  id: "b",
  job_id: null,
  company: "字节跳动",
  title: "前端",
  url: "",
  status: "applied",
  note: "",
  applied_at: "2026-11-15",
  updated_at: "2026-11-15T10:00:00Z",
  ...o,
});
const app = (o: Partial<Application>): Application => ({
  id: "a",
  channel: "boss",
  external_id: "x",
  company: "某科技",
  title: "前端实习",
  city: "北京",
  salary: "",
  url: "",
  status: "greeted",
  applied_at: "2026-11-15T09:00:00",
  updated_at: "2026-11-15T09:00:00",
  ...o,
});

describe("unify", () => {
  it("skips todo cards and maps statuses to response / interview / offer", () => {
    const rows = unify(
      [board({ status: "todo" }), board({ status: "interview" }), board({ status: "rejected" })],
      [app({ status: "replied" }), app({ status: "offer" })],
    );
    expect(rows.map((r) => [r.source, r.responded, r.interview, r.offer, r.rejected])).toEqual([
      ["official", true, true, false, false],
      ["official", false, false, false, true],
      ["boss", true, false, false, false],
      ["boss", true, true, true, false],
    ]);
  });
});

describe("overview", () => {
  it("counts per source, today, last 7 days and daily buckets", () => {
    const rows = unify(
      [board({ applied_at: "2026-11-10" }), board({ applied_at: "2026-10-01" })],
      [app({}), app({ applied_at: "2026-11-14T20:00:00" }), app({ channel: "liepin" })],
    );
    const o = overview(rows, now);
    expect([o.total, o.today, o.week]).toEqual([5, 2, 4]);
    const bySrc = Object.fromEntries(o.sources.map((s) => [s.source, [s.total, s.today, s.week]]));
    expect(bySrc).toEqual({ official: [2, 0, 1], boss: [2, 1, 2], liepin: [1, 1, 1] });
    expect(o.days).toHaveLength(14);
    expect(o.days.at(-1)).toMatchObject({ day: "2026-11-15", total: 2, bySource: { boss: 1, liepin: 1, official: 0 } });
    expect(o.days.find((d) => d.day === "2026-11-10")?.bySource.official).toBe(1);
  });

  it("only reports a response rate with 5+ samples", () => {
    expect(overview(unify([], [app({ status: "replied" })]), now).responseRate).toBeUndefined();
    const five = Array.from({ length: 5 }, (_, i) => app({ external_id: String(i), status: i < 2 ? "replied" : "greeted" }));
    expect(overview(unify([], five), now).responseRate).toBeCloseTo(0.4);
  });
});
