import { beforeEach, describe, expect, it } from "vitest";
import { Profile } from "@offerpilot/shared";
import { ancestorLabel, detectBlocker, fillForm, labelOf } from "./formFill";

const profile = Profile.parse({
  name: "张三",
  school: "浙江大学",
  major: "计算机科学与技术",
  degree: "master",
  graduationYear: 2027,
});

const page = (html: string) => {
  document.body.innerHTML = html;
};
const val = (sel: string) => (document.querySelector(sel) as HTMLInputElement | HTMLSelectElement).value;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("labelOf", () => {
  it("reads label[for], wrapping labels and UI-library form items", () => {
    page(`<label for="a">姓名 *</label><input id="a">
          <label>学校 <input id="b"></label>
          <div class="ant-form-item"><div class="ant-form-item-label">专业</div><div><input id="c"></div></div>`);
    expect(labelOf(document.getElementById("a")!)).toContain("姓名");
    expect(labelOf(document.getElementById("b")!)).toContain("学校");
    expect(labelOf(document.getElementById("c")!)).toContain("专业");
  });
});

describe("fillForm", () => {
  it("still finds the form-item label when the input has a generic placeholder", () => {
    page(`<div class="ant-form-item"><div class="ant-form-item-label"><label>毕业院校</label></div><input id="s" placeholder="请输入"></div>
          <div class="ant-form-item"><div class="ant-form-item-label"><label>学历</label></div><input id="d" readonly placeholder="请选择"></div>`);
    const r = fillForm(document, profile);
    expect(r.filled).toEqual(["学校"]);
    expect(r.manual).toEqual(["学历"]);
  });

  it("fills basic fields by label, including selects", () => {
    page(`<form>
      <label for="n">姓名</label><input id="n" type="text">
      <label for="s">毕业院校</label><input id="s" type="text">
      <label for="m">专业</label><input id="m" type="text">
      <label for="y">毕业年份</label><input id="y" type="text">
      <label for="d">最高学历</label><select id="d"><option value="">请选择</option><option value="1">本科</option><option value="2">硕士研究生</option><option value="3">博士研究生</option></select>
    </form>`);
    const r = fillForm(document, profile);
    expect(r.filled.sort()).toEqual(["学历", "学校", "姓名", "专业", "毕业年份"].sort());
    expect(val("#n")).toBe("张三");
    expect(val("#s")).toBe("浙江大学");
    expect(val("#y")).toBe("2027");
    expect((document.getElementById("d") as HTMLSelectElement).selectedOptions[0]!.text).toBe("硕士研究生");
  });

  it("does not overwrite existing values, and leaves unrelated fields alone", () => {
    page(`<label for="n">姓名</label><input id="n" value="已有">
          <label for="e">邮箱</label><input id="e" type="email">
          <label for="p">密码</label><input id="p" type="password">
          <label for="u">学校邮箱</label><input id="u" type="text">`);
    const r = fillForm(document, profile);
    expect(r.kept).toEqual(["姓名"]);
    expect(r.filled).toEqual([]);
    expect(val("#n")).toBe("已有");
    expect(val("#e")).toBe("");
    expect(val("#u")).toBe("");
  });

  it("reports read-only (custom dropdown) shells as manual instead of writing", () => {
    page(`<label for="d">学历</label><input id="d" readonly placeholder="请选择">`);
    const r = fillForm(document, profile);
    expect(r.manual).toEqual(["学历"]);
    expect(val("#d")).toBe("");
  });

  it("skips fields the profile has no real value for", () => {
    page(`<label for="n">姓名</label><input id="n">`);
    const blank = Profile.parse({ name: "未命名", school: "-", major: "-", degree: "bachelor", graduationYear: 2027 });
    expect(fillForm(document, blank).filled).toEqual([]);
  });
});

describe("detectBlocker", () => {
  it("flags captcha widgets", () => {
    page(`<div class="geetest_panel"></div>`);
    expect(detectBlocker(document)).toMatch(/验证码/);
    page(`<div>正常页面</div>`);
    expect(detectBlocker(document)).toBeNull();
  });
});

describe("ancestorLabel fallback", () => {
  it("fills fields whose label sits in an unnamed sibling node of a custom component library", () => {
    page(`<div class="r"><div class="c1"><span>毕业院校</span></div><div class="c2"><div class="w"><input id="s"></div></div></div>
          <div class="r"><div><span>专业</span></div><div><div><input id="m"></div></div></div>
          <div class="section"><h3>教育经历 这是一段很长很长很长的说明文字用来超过三十个字的长度限制不应该被当成标签</h3><input id="x"><input id="y"></div>`);
    expect(ancestorLabel(document.getElementById("s")!)).toBe("毕业院校");
    const report = fillForm(document, profile);
    expect(report.filled).toEqual(expect.arrayContaining(["学校", "专业"]));
    expect(val("#s")).toBe("浙江大学");
    expect(val("#m")).toBe("计算机科学与技术");
    expect(val("#x")).toBe("");
  });
});
