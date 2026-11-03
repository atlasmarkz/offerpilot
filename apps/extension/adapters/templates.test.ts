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
    expect(r.missing.sort()).toEqual(["手机", "邮箱"]);
    expect((document.getElementById("c") as HTMLInputElement).value).toBe("");
  });

  it("fills them once the user supplies extras", () => {
    page(html);
    const r = fillForm(document, profile, { extras: { 手机: "13800000000", 邮箱: "a@b.com" } });
    expect(r.missing).toEqual([]);
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
