import { describe, expect, it } from "vitest";
import { collectBoardStructure, sketch } from "./diagnose";

describe("collectBoardStructure", () => {
  it("reports selector hits and a skeleton without leaking names", () => {
    document.body.innerHTML = `
      <div class="user-nav"><span class="name">张小明</span></div>
      <ul class="rec-job-list"><li class="job-card-box">
        <a class="job-name" href="/job_detail/abc.html?lid=1">前端开发实习生</a><span class="boss-name">某某科技有限公司</span>
      </li></ul>
      <div class="job-detail-box"><a class="op-btn-chat">立即沟通</a><span class="boss-active-time">刚刚活跃</span><span class="boss-name">李女士</span></div>`;
    const r = collectBoardStructure(document, "https://www.zhipin.com/web/geek/jobs?query=x&city=1");
    expect(r.url).toBe("https://www.zhipin.com/web/geek/jobs");
    expect(r.hits.card).toBe(1);
    expect(r.hits.chatBtn).toBe(1);
    expect(r.parsed).toEqual([{ hasId: true, realId: true, title: 7, company: 8, salary: "无", city: false, tags: 0 }]);
    expect(r.buttons).toEqual(["立即沟通"]);
    const all = JSON.stringify(r);
    expect(all).toContain("/job_detail/{id}");
    expect(all).toContain("刚刚活跃");
    for (const secret of ["张小明", "李女士", "前端开发实习生", "某某科技", "abc.html"]) expect(all).not.toContain(secret);
  });

  it("limits depth and children", () => {
    document.body.innerHTML = `<div class="a">${"<p>x</p>".repeat(20)}</div>`;
    expect(sketch(document.querySelector(".a"))).toContain("…还有 6 个");
  });
});
