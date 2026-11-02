import { describe, expect, it } from "vitest";
import { rowToJob } from "./jobsSource";

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
  it("drops malformed rows instead of throwing", () => {
    expect(rowToJob({ ...row, kind: "weird" })).toBeUndefined();
    expect(rowToJob({})).toBeUndefined();
  });
});
