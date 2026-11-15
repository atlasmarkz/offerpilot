import { describe, expect, it } from "vitest";
import { authHeaders, rowToJob, supabaseOrigin } from "./jobsSource";

const row = {
  id: "abc",
  company_id: "bilibili",
  company_type: "internet",
  title: "后端",
  kind: "fulltime",
  cities: ["上海"],
  description: "",
  requirements: { graduationYears: [2027] },
  deadline: null,
  apply_url: "https://example.com/1",
  source_url: "https://example.com/list",
  review_status: "approved",
};

describe("rowToJob", () => {
  it("maps a database row", () => {
    expect(rowToJob(row)).toMatchObject({ companyId: "bilibili", city: ["上海"], reviewStatus: "approved" });
  });
  it("maps freshness columns, and treats rows from before the 0010 migration as open", () => {
    expect(rowToJob({ ...row, source: "bilibili-campus", posted_at: "2026-11-02", first_seen_at: "2026-11-03T19:00:00+00:00", last_seen_at: "2026-11-14T19:00:00+00:00", status: "closed", miss_count: 2 })).toMatchObject({
      source: "bilibili-campus",
      postedAt: "2026-11-02",
      firstSeenAt: "2026-11-03T19:00:00+00:00",
      status: "closed",
      missCount: 2,
    });
    expect(rowToJob(row)).toMatchObject({ status: "open", missCount: 0, postedAt: undefined });
  });
  it("drops malformed rows instead of throwing", () => {
    expect(rowToJob({ ...row, kind: "weird" })).toBeUndefined();
    expect(rowToJob({})).toBeUndefined();
  });
});

describe("supabaseOrigin", () => {
  it("keeps only the origin, so pasted paths do not break requests", () => {
    expect(supabaseOrigin("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(supabaseOrigin(" https://abc.supabase.co/rest/v1/ ")).toBe("https://abc.supabase.co");
  });
  it("rejects values that are not URLs", () => {
    expect(() => supabaseOrigin("abc.supabase.co")).toThrow(/格式/);
  });
});

describe("authHeaders", () => {
  it("does not put new-style keys in Authorization", () => {
    expect(authHeaders("sb_publishable_x")).toEqual({ apikey: "sb_publishable_x" });
    expect(authHeaders("eyJ.a.b")).toHaveProperty("Authorization");
  });
});
