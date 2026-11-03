import { describe, expect, it } from "vitest";
import type { BoardItem, BoardStatus } from "./board";
import { boardStats } from "./boardStats";

const now = new Date("2026-11-04T12:00:00"); // 周三
let n = 0;
const item = (status: BoardStatus, over: Partial<BoardItem> = {}): BoardItem => ({
  id: `i${n++}`,
  job_id: null,
  company: "",
  title: "岗位",
  url: "",
  status,
  note: "",
  applied_at: null,
  updated_at: "2026-11-03T00:00:00Z",
  ...over,
});

describe("boardStats", () => {
  it("counts funnel steps by how far each application got", () => {
    const s = boardStats([item("todo"), item("applied"), item("applied"), item("written_test"), item("interview"), item("offer"), item("rejected")], now);
    expect(s).toMatchObject({ total: 7, submitted: 6, active: 4, offers: 1, rejected: 1 });
    expect(s.funnel.map((f) => [f.status, f.count, f.reached])).toEqual([
      ["todo", 1, 6],
      ["applied", 2, 5],
      ["written_test", 1, 3],
      ["interview", 1, 2],
      ["offer", 1, 1],
    ]);
  });

  it("gives rates only with enough samples", () => {
    expect(boardStats([item("applied")], now)).toMatchObject({ responseRate: undefined, offerRate: undefined });
    const s = boardStats([item("applied"), item("interview"), item("offer"), item("rejected")], now);
    expect(s.responseRate).toBeCloseTo(2 / 4);
    expect(s.offerRate).toBeCloseTo(1 / 2);
  });

  it("buckets applications into the last 8 weeks (Monday start)", () => {
    const s = boardStats(
      [item("applied", { applied_at: "2026-11-02" }), item("applied", { applied_at: "2026-11-04" }), item("applied", { applied_at: "2026-10-20" }), item("applied", { applied_at: "2025-01-01" })],
      now,
    );
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[7]).toMatchObject({ start: "2026-11-02", count: 2 });
    expect(s.weeks[5]).toMatchObject({ start: "2026-10-19", count: 1 });
    expect(s.weeks.reduce((a, w) => a + w.count, 0)).toBe(3);
  });

  it("reminds about stale applications and old todo items, stale first", () => {
    const s = boardStats(
      [item("todo", { updated_at: "2026-10-20T00:00:00Z" }), item("applied", { updated_at: "2026-10-10T00:00:00Z" }), item("applied", { updated_at: "2026-11-03T00:00:00Z" })],
      now,
    );
    expect(s.reminders.map((r) => r.kind)).toEqual(["stale", "todo-old"]);
  });

  it("ranks companies", () => {
    const s = boardStats([item("applied", { company: "B" }), item("applied", { company: "A" }), item("applied", { company: "A" }), item("applied")], now);
    expect(s.topCompanies).toEqual([
      { company: "A", count: 2 },
      { company: "B", count: 1 },
    ]);
  });
});
