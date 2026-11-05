import { beforeEach, describe, expect, it } from "vitest";
import { Profile } from "@offerpilot/shared";
import { fillForm } from "./formFill";
import { genericAdapter } from "./generic";
import { detectTemplate } from "./templates";

const profile = Profile.parse({ name: "张三", school: "浙江大学", major: "计算机", degree: "master", graduationYear: 2027, cities: ["杭州"] });
const page = (html: string) => {
  document.body.innerHTML = html;
};
beforeEach(() => page(""));

describe("detectTemplate", () => {
  it("recognises sites by host", () => {
    expect(detectTemplate(document, "https://jobs.feishu.cn/campus/apply").template.id).toBe("feishu");
    expect(detectTemplate(document, "https://app.mokahr.com/campus_apply/x").template.id).toBe("moka");
    expect(detectTemplate(document, "https://x.zhiye.com/").template.id).toBe("beisen");
    expect(detectTemplate(document, "https://acme.wd1.myworkdayjobs.com/en/apply").template.id).toBe("workday");
    // 飞书招聘的租户：字节、小米（白标域名）、得物、蔚来
    for (const u of ["https://jobs.bytedance.com/campus/position/1/detail", "https://xiaomi.jobs.f.mioffice.cn/campus", "https://poizon.jobs.feishu.cn/index", "https://nio.jobs.feishu.cn/campus"])
      expect(detectTemplate(document, u).template.id).toBe("feishu");
    expect(detectTemplate(document, "https://wecruit500.hotjob.cn/SU5fb249/pb/index.html").template.id).toBe("hotjob");
    expect(detectTemplate(document, "https://iflytek.zhiye.com/").template.id).toBe("beisen");
  });

  it("falls back to UI-library fingerprints, then to native", () => {
    page(`<div class="ant-form-item"><label>姓名</label><input></div>`);
    expect(detectTemplate(document, "https://careers.example.com/").template.id).toBe("antd");
    page(`<div class="el-form-item"><label>姓名</label><input></div>`);
    expect(detectTemplate(document, "https://careers.example.com/").template.id).toBe("element");
    page(`<label for="a">姓名</label><input id="a">`);
    expect(detectTemplate(document, "https://careers.example.com/").template.id).toBe("native");
  });

  it("prefers a host match over library fingerprints", () => {
    page(`<div class="ant-form-item"><label>姓名</label><input></div><div class="ud__form__item"></div>`);
    expect(detectTemplate(document, "https://jobs.feishu.cn/x").template.id).toBe("feishu");
  });
});

describe("missing info and extras", () => {
  const html = `<label for="p">手机号</label><input id="p" type="tel">
                <label for="e">邮箱</label><input id="e" type="email">
                <label for="n">姓名</label><input id="n">
                <label for="c">紧急联系人姓名</label><input id="c">`;

  it("reports fields the page asks for but we have no value for", () => {
    page(html);
    const r = fillForm(document, profile);
    expect(r.filled).toEqual(["姓名"]);
    // 紧急联系人也在“个人隐私信息”目录里：页面问了就报缺少，但绝不会拿手机、姓名去顶替它
    expect(r.missing.sort()).toEqual(["手机", "紧急联系人", "邮箱"]);
    expect((document.getElementById("c") as HTMLInputElement).value).toBe("");
  });

  it("fills them once the user supplies extras", () => {
    page(html);
    const r = fillForm(document, profile, { extras: { 手机: "13800000000", 邮箱: "a@b.com", 紧急联系人: "李四" } });
    expect(r.missing).toEqual([]);
    expect((document.getElementById("c") as HTMLInputElement).value).toBe("李四");
    expect((document.getElementById("p") as HTMLInputElement).value).toBe("13800000000");
    expect((document.getElementById("e") as HTMLInputElement).value).toBe("a@b.com");
  });

  it("extras can supply what the profile lacks, and select/radio fields work", () => {
    page(`<label for="g">政治面貌</label><select id="g"><option value="">请选择</option><option>群众</option><option>共青团员</option></select>
          <input type="radio" name="sex" id="m"><label for="m">男</label>
          <input type="radio" name="sex" id="f"><label for="f">女</label>`);
    const miss = fillForm(document, profile);
    expect(miss.missing.sort()).toEqual(["性别", "政治面貌"].sort());
    page(document.body.innerHTML);
    const r = fillForm(document, profile, { extras: { 政治面貌: "共青团员", 性别: "女" } });
    expect(r.missing).toEqual([]);
    expect((document.getElementById("g") as HTMLSelectElement).value).toBe("共青团员");
    expect((document.getElementById("f") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("m") as HTMLInputElement).checked).toBe(false);
  });
});

describe("template adapter", () => {
  it("returns the template name and asks the user for the missing fields", async () => {
    page(`<div class="ud__form__item"><div class="ud__form__item__label">毕业院校</div><input id="s"></div>
          <div class="ud__form__item"><div class="ud__form__item__label">手机号码</div><input id="p"></div>`);
    const o = await genericAdapter.fill(document, profile, {});
    expect(o).toMatchObject({ status: "needs_user", template: "飞书招聘", missing: ["手机"], filledFields: ["学校"] });
    const again = await genericAdapter.fill(document, profile, { 手机: "13800000000" });
    expect(again).toMatchObject({ status: "filled", template: "飞书招聘" });
  });
});

describe("real Feishu Hire markup (ud-formily)", () => {
  it("reads labels from .ud-formily-item and fills basic fields", async () => {
    page(`<div class="ud-formily-item"><div class="ud-formily-item-label"><label>姓名*</label></div><div class="ud-formily-item-control"><div class="ud__input"><span class="ud__input-input__placeholder__wrapper"><input class="ud__native-input"></span></div></div></div>
          <div class="ud-formily-item"><div class="ud-formily-item-label"><label>邮箱*</label></div><div class="ud-formily-item-control"><div class="ud__input"><input class="ud__native-input"></div></div></div>`);
    const o = await genericAdapter.fill(document, profile, { 邮箱: "a@b.com" });
    expect(o).toMatchObject({ status: "filled", template: "飞书招聘", filledFields: ["姓名", "邮箱"] });
  });
});

describe("private-info catalog drives the extra fields", () => {
  it("fills ID number, birth date text, hometown, WeChat and address from local private info", () => {
    page(`<label for="a">证件号码</label><input id="a">
          <label for="b">籍贯</label><input id="b">
          <label for="w">微信号</label><input id="w">
          <label for="h">家庭住址</label><input id="h">
          <label for="t">证件类型</label><input id="t">`);
    const r = fillForm(document, profile, { extras: { 证件号码: "330106200001010011", 籍贯: "浙江杭州", 微信号: "wx_zs", 家庭住址: "某省某市某路 1 号" } });
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("330106200001010011");
    expect((document.getElementById("b") as HTMLInputElement).value).toBe("浙江杭州");
    expect((document.getElementById("w") as HTMLInputElement).value).toBe("wx_zs");
    expect((document.getElementById("h") as HTMLInputElement).value).toBe("某省某市某路 1 号");
    // “证件类型”不是“证件号码”，不能把号码填进去
    expect((document.getElementById("t") as HTMLInputElement).value).toBe("");
    expect(r.filled).toEqual(expect.arrayContaining(["证件号码", "籍贯", "微信号", "家庭住址"]));
  });
});

describe("unrecognized fields", () => {
  it("lists empty controls with no matching field, but not ones inside repeatable rows or already filled", () => {
    page(`<label for="x">毕业去向</label><input id="x">
          <label for="y">兴趣爱好</label><input id="y" value="游泳">
          <div class="u-wraps"><label for="z">实验成果</label><input id="z"></div>`);
    const r = fillForm(document, profile);
    expect(r.unrecognized).toEqual(["毕业去向"]);
  });
});

describe("check mode for basic fields", () => {
  it("reports values that differ from the profile and fills nothing", () => {
    page(`<label for="s">毕业院校</label><input id="s" value="另一所大学">
          <label for="m">专业</label><input id="m" value="计算机科学与技术">
          <label for="n">姓名</label><input id="n">`);
    const r = fillForm(document, profile, { check: true });
    expect(r.differs).toEqual([{ label: "学校", expected: profile.school, actual: "另一所大学" }]);
    expect(r.empty).toContain("姓名");
    expect((document.getElementById("n") as HTMLInputElement).value).toBe("");
    expect(r.filled).toEqual([]);
  });
  it("in fill mode it still does not overwrite, but flags the difference", () => {
    page(`<label for="s">毕业院校</label><input id="s" value="另一所大学">`);
    const r = fillForm(document, profile);
    expect((document.getElementById("s") as HTMLInputElement).value).toBe("另一所大学");
    expect(r.differs).toHaveLength(1);
  });
});
