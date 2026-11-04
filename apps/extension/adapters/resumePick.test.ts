import { describe, expect, it } from "vitest";
import { chooseResumeId, pickResume, sanitizeResumes } from "./resumePick";

const doc = (id: string, school = "某大学") => ({ id, name: `简历${id}`, data: { education: [{ school }] } });

describe("sanitizeResumes", () => {
  it("keeps valid entries, drops ones without an id, and caps the count", () => {
    const list = sanitizeResumes([doc("a"), { name: "x", data: {} }, null, doc("b")]);
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
    expect(list[0]!.data.education[0]!.school).toBe("某大学");
    expect(sanitizeResumes(Array.from({ length: 30 }, (_, i) => doc(String(i))))).toHaveLength(10);
    expect(sanitizeResumes("nope")).toEqual([]);
  });
});

describe("chooseResumeId", () => {
  const list = sanitizeResumes([doc("a"), doc("b"), doc("c")]);
  it("keeps the user's choice in the extension while it still exists", () => {
    expect(chooseResumeId(list, "c", "a")).toBe("c");
  });
  it("falls back to the one active on the web, then to the first", () => {
    expect(chooseResumeId(list, "gone", "b")).toBe("b");
    expect(chooseResumeId(list, undefined, "gone")).toBe("a");
    expect(chooseResumeId([], "a", "a")).toBeUndefined();
  });
});

describe("pickResume", () => {
  it("uses the chosen resume, else the first", () => {
    const resumes = [doc("a", "甲大学"), doc("b", "乙大学")];
    expect(pickResume({ resumes, resumeId: "b" })?.data.education[0]!.school).toBe("乙大学");
    expect(pickResume({ resumes, resumeId: "zzz" })?.id).toBe("a");
  });
  it("still understands the old single-resume storage", () => {
    expect(pickResume({ resume: { education: [{ school: "旧大学" }] } })?.data.education[0]!.school).toBe("旧大学");
    expect(pickResume({})).toBeUndefined();
  });
});
