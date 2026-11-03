"use client";

import type { ExperienceAtom } from "@offerpilot/shared";
import type { ResumeData } from "../../lib/resumeData";

const GROUPS: { kind: ExperienceAtom["kind"]; title: string }[] = [
  { kind: "internship", title: "实习经历" },
  { kind: "project", title: "项目经历" },
  { kind: "research", title: "科研经历" },
  { kind: "campus", title: "校园经历" },
  { kind: "award", title: "荣誉奖项" },
];

const range = (a?: string, b?: string) => [a, b].filter(Boolean).join(" – ");

/** 简历纸面预览（A4）。导出 PDF 时只打印这一块，样式见 globals.css 的 @media print。 */
export function ResumePreview({ resume }: { resume: ResumeData }) {
  const c = resume.contact;
  const meta = [c.phone, c.email, c.city, ...c.links].filter(Boolean);
  return (
    <article className="resume-paper" id="resume-paper" aria-label="简历预览">
      <header className="rp-head">
        <h1>{c.name || "你的姓名"}</h1>
        {meta.length > 0 && <div className="rp-meta">{meta.join("  ·  ")}</div>}
      </header>

      {resume.summary && (
        <section>
          <h2>自我评价</h2>
          <p>{resume.summary}</p>
        </section>
      )}

      {resume.education.length > 0 && (
        <section>
          <h2>教育背景</h2>
          {resume.education.map((e, i) => (
            <div className="rp-item" key={i}>
              <div className="rp-row">
                <b>{e.school}</b>
                <span>{range(e.start, e.end)}</span>
              </div>
              <div className="rp-sub">{[e.major, e.degree, e.gpa].filter(Boolean).join("  ·  ")}</div>
              {e.highlights.length > 0 && (
                <ul>
                  {e.highlights.map((h, j) => (
                    <li key={j}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {GROUPS.map(({ kind, title }) => {
        const items = resume.experiences.filter((x) => x.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind}>
            <h2>{title}</h2>
            {items.map((x, i) => (
              <div className="rp-item" key={i}>
                <div className="rp-row">
                  <b>{[x.title, x.org].filter(Boolean).join(" · ")}</b>
                  <span>{range(x.start, x.end)}</span>
                </div>
                {x.bullets.length > 0 && (
                  <ul>
                    {x.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
                {x.skills.length > 0 && <div className="rp-sub">技术栈：{x.skills.join("、")}</div>}
              </div>
            ))}
          </section>
        );
      })}

      {resume.skills.length > 0 && (
        <section>
          <h2>专业技能</h2>
          <p>{resume.skills.join("、")}</p>
        </section>
      )}
    </article>
  );
}
