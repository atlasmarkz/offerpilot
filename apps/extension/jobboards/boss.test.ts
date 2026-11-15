import { describe, expect, it } from "vitest";
import { bossAdapter } from "./boss";

/**
 * Boss 新版搜索页结构：类名参考 get_jobs 2026-10 实测的 ul.rec-job-list li.job-card-box / a.job-name / span.boss-name
 * / span.company-location / ul.tag-list li / a.op-btn-chat / .greet-boss-dialog。本项目还没在登录后的页面上亲自核对。
 */
function page(detailHtml = "") {
  document.body.innerHTML = `
    <div class="job-list-container">
      <ul class="rec-job-list">
        <li class="job-card-box">
          <a class="job-name" href="/job_detail/abc123.html?lid=x&securityId=y">前端开发实习生</a>
          <span class="job-salary">200-300元/天</span>
          <span class="boss-name">某某科技</span><span class="company-location">北京·海淀区</span>
          <ul class="tag-list"><li>在校/应届</li><li>本科</li></ul>
        </li>
        <li class="job-card-box">
          <a class="job-name" href="/job_detail/def456.html">Java 实习</a>
          <span class="boss-name">另一家</span>
        </li>
        <li class="job-card-box"><span>广告位</span></li>
      </ul>
    </div>
    <div class="job-detail-box">${detailHtml}</div>`;
}

describe("bossAdapter.listJobs", () => {
  it("reads cards into BoardJob and skips cards without a job link", () => {
    page();
    const jobs = bossAdapter.listJobs(document);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      channel: "boss",
      externalId: "abc123",
      title: "前端开发实习生",
      company: "某某科技",
      city: "北京·海淀区",
      salary: "200-300元/天",
      tags: ["在校/应届", "本科"],
      url: "https://www.zhipin.com/job_detail/abc123.html",
    });
  });
});

describe("bossAdapter.apply", () => {
  it("treats '继续沟通' as already contacted", async () => {
    page(`<a class="op-btn op-btn-chat">继续沟通</a>`);
    expect(await bossAdapter.apply(document, bossAdapter.listJobs(document)[0]!, "")).toEqual({ kind: "already" });
  });

  it("reports sent when the greet dialog appears, and clicks 留在此页 (never 继续沟通)", async () => {
    page(`<a class="op-btn op-btn-chat">立即沟通</a>`);
    const btn = document.querySelector(".op-btn-chat")!;
    const clicked: string[] = [];
    btn.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="greet-boss-dialog"><div class="dialog-title">已向BOSS发送消息</div>
           <div class="greet-boss-footer"><a class="default-btn">留在此页</a><a class="sure-btn">继续沟通</a></div></div>`,
      );
      for (const a of document.querySelectorAll(".greet-boss-footer a")) a.addEventListener("click", () => clicked.push(a.textContent!));
    });
    expect(await bossAdapter.apply(document, bossAdapter.listJobs(document)[0]!, "")).toEqual({ kind: "sent" });
    expect(clicked).toEqual(["留在此页"]);
  });

  it("swaps the temporary card id for the real one from the detail pane", async () => {
    document.body.innerHTML = `
      <ul class="rec-job-list"><li class="job-card-box"><a class="job-name">算法实习</a><span class="boss-name">某司</span></li></ul>
      <div class="job-detail-box"><span class="job-name">算法实习</span><a class="more-job-btn" href="/job_detail/zz9.html?lid=1">查看更多信息</a>
        <div class="job-sec-text">负责推荐算法</div><span class="boss-active-time">刚刚活跃</span><div class="boss-info-attr">某司 · 猎头顾问</div></div>`;
    const [card] = bossAdapter.listJobs(document);
    expect(card!.externalId).toBe("t:某司|算法实习");
    const job = await bossAdapter.openJob(document, card!);
    expect(job).toMatchObject({
      externalId: "zz9",
      url: "https://www.zhipin.com/job_detail/zz9.html",
      description: "负责推荐算法",
      hrActive: "刚刚活跃",
      recruiter: "某司 · 猎头顾问",
    });
  });

  it("reports the platform's daily limit", async () => {
    page(`<a class="op-btn op-btn-chat">立即沟通</a>`);
    document.querySelector(".op-btn-chat")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", `<div class="dialog-container">今日沟通人数已达上限，请明天再来</div>`);
    });
    const r = await bossAdapter.apply(document, bossAdapter.listJobs(document)[0]!, "");
    expect(r.kind).toBe("limit");
  });

  it("fails without a chat button", async () => {
    page();
    expect((await bossAdapter.apply(document, bossAdapter.listJobs(document)[0]!, "")).kind).toBe("failed");
  });
});

describe("bossAdapter.detectBlocker", () => {
  it("spots captchas", () => {
    page();
    expect(bossAdapter.detectBlocker(document)).toBeNull();
    document.body.insertAdjacentHTML("beforeend", `<div class="geetest_panel"></div>`);
    expect(bossAdapter.detectBlocker(document)).toBe("页面出现了验证码");
  });
  it("spots the security-verify redirect", () => {
    page();
    const doc = { location: { href: "https://www.zhipin.com/web/passport/zp/verify.html?x=1" }, querySelector: () => null } as unknown as Document;
    expect(bossAdapter.detectBlocker(doc)).toBe("Boss 要求安全验证");
  });
});
