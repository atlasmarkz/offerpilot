import { beforeEach, describe, expect, it } from "vitest";
import { collectStructure } from "./diagnose";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collectStructure", () => {
  it("records structure, repeated blocks and custom selects, but never field values", () => {
    document.body.innerHTML = `
      <h3>教育经历</h3><button>添加</button>
      <div class="card"><div class="ud-formily-item"><div class="ud-formily-item-label">学校名称</div><input id="a" value="张三的秘密学校" placeholder="请输入"></div></div>
      <div class="card"><div class="ud-formily-item"><div class="ud-formily-item-label">学校名称</div><input id="b"></div></div>
      <div class="ud-formily-item"><div class="ud-formily-item-label">学历</div><div class="ud__select"><input id="c" readonly></div></div>
      <select id="d"><option value="">请选择</option><option value="1">本科</option></select>`;
    const r = collectStructure(document, "https://jobs.example.com/apply/edit?token=SECRET&id=7");
    expect(r.url).toBe("https://jobs.example.com/apply/edit");
    expect(r.headings).toContain("教育经历");
    expect(r.buttons["添加"]).toBe(1);
    expect(r.fields).toHaveLength(4);

    const a = r.fields[0]!;
    expect(a.label).toContain("学校名称");
    expect(a.filled).toBe(true);
    expect(a.repeat).toMatchObject({ index: 0, of: 2 });
    expect(r.fields[1]!.repeat).toMatchObject({ index: 1, of: 2 });
    expect(r.fields[2]!.customSelect).toContain("ud__select");
    expect(r.fields[2]!.readonly).toBe(true);
    expect(r.fields[3]!.options).toEqual(["请选择", "本科"]);

    const text = JSON.stringify(r);
    expect(text).not.toContain("张三的秘密学校");
    expect(text).not.toContain("SECRET");
  });

  it("caps the number of fields", () => {
    document.body.innerHTML = Array.from({ length: 200 }, (_, i) => `<input id="i${i}">`).join("");
    const r = collectStructure(document, "https://x.test/");
    expect(r.fields).toHaveLength(150);
    expect(r.truncated).toBe(true);
  });
});
