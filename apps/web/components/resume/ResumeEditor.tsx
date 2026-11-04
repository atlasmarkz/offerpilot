"use client";

import type { ExperienceAtom } from "@offerpilot/shared";
import type { Education, ResumeData } from "../../lib/resumeData";

const KIND_OPTIONS: { value: ExperienceAtom["kind"]; label: string }[] = [
  { value: "internship", label: "实习" },
  { value: "project", label: "项目" },
  { value: "research", label: "科研" },
  { value: "campus", label: "校园" },
  { value: "award", label: "奖项" },
];

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (s: string) => s.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean);

interface Props {
  resume: ResumeData;
  onChange: (r: ResumeData) => void;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

export function ResumeEditor({ resume, onChange }: Props) {
  const set = (patch: Partial<ResumeData>) => onChange({ ...resume, ...patch });

  const setEdu = (i: number, patch: Partial<Education>) =>
    set({ education: resume.education.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setExp = (i: number, patch: Partial<ExperienceAtom>) =>
    set({ experiences: resume.experiences.map((e, k) => (k === i ? { ...e, ...patch } : e)) });

  return (
    <div className="editor">
      <section className="panel">
        <div className="panel-head">
          <h2>自我评价</h2>
        </div>
        <textarea
          className="input"
          rows={3}
          maxLength={500}
          placeholder="一两句话概括你的优势和目标（可留空）"
          value={resume.summary}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>教育背景</h2>
          <button
            className="btn ghost sm"
            style={{ marginLeft: "auto" }}
            disabled={resume.education.length >= 6}
            onClick={() =>
              set({ education: [...resume.education, { school: "", major: "", degree: "", start: "", end: "", gpa: "", college: "", lab: "", advisor: "", honors: "", highlights: [] }] })
            }
          >
            ＋ 添加
          </button>
        </div>
        {resume.education.length === 0 && <p className="msg" style={{ color: "var(--faint)" }}>还没有教育经历</p>}
        {resume.education.map((e, i) => (
          <div className="item-card" key={i}>
            <div className="form-grid">
              <Field label="学校">
                <input className="input" value={e.school} onChange={(ev) => setEdu(i, { school: ev.target.value })} />
              </Field>
              <Field label="专业">
                <input className="input" value={e.major} onChange={(ev) => setEdu(i, { major: ev.target.value })} />
              </Field>
              <Field label="学历">
                <input className="input" placeholder="本科 / 硕士 / 博士" value={e.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} />
              </Field>
              <Field label="开始（如 2023-09）">
                <input className="input" value={e.start} onChange={(ev) => setEdu(i, { start: ev.target.value })} />
              </Field>
              <Field label="结束（如 2027-06）">
                <input className="input" value={e.end} onChange={(ev) => setEdu(i, { end: ev.target.value })} />
              </Field>
              <Field label="成绩 / 排名">
                <input className="input" placeholder="如 专业前 5%" value={e.gpa} onChange={(ev) => setEdu(i, { gpa: ev.target.value })} />
              </Field>
              <Field label="所在学院">
                <input className="input" placeholder="如 控制与计算机工程学院" value={e.college} onChange={(ev) => setEdu(i, { college: ev.target.value })} />
              </Field>
              <Field label="实验室（选填）">
                <input className="input" value={e.lab} onChange={(ev) => setEdu(i, { lab: ev.target.value })} />
              </Field>
              <Field label="导师（选填）">
                <input className="input" value={e.advisor} onChange={(ev) => setEdu(i, { advisor: ev.target.value })} />
              </Field>
              <Field label="荣誉奖项（获奖时间 + 名称，选填；投递页常单独问）" wide>
                <textarea className="input" rows={2} value={e.honors} onChange={(ev) => setEdu(i, { honors: ev.target.value })} />
              </Field>
              <Field label="要点（荣誉、课程等，每行一条）" wide>
                <textarea className="input" rows={2} value={e.highlights.join("\n")} onChange={(ev) => setEdu(i, { highlights: lines(ev.target.value).slice(0, 8) })} />
              </Field>
            </div>
            <button className="link-btn" onClick={() => set({ education: resume.education.filter((_, k) => k !== i) })}>
              删除这一条
            </button>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>经历</h2>
          <span className="hint">实习 / 项目 / 科研 / 校园 / 奖项</span>
          <button
            className="btn ghost sm"
            style={{ marginLeft: "auto" }}
            disabled={resume.experiences.length >= 20}
            onClick={() =>
              set({ experiences: [...resume.experiences, { kind: "project", title: "", org: "", start: "", end: "", bullets: [], skills: [] }] })
            }
          >
            ＋ 添加
          </button>
        </div>
        {resume.experiences.length === 0 && <p className="msg" style={{ color: "var(--faint)" }}>还没有经历</p>}
        {resume.experiences.map((x, i) => (
          <div className="item-card" key={i}>
            <div className="form-grid">
              <Field label="类型">
                <select className="input" value={x.kind} onChange={(ev) => setExp(i, { kind: ev.target.value as ExperienceAtom["kind"] })}>
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="名称 / 岗位">
                <input className="input" value={x.title} onChange={(ev) => setExp(i, { title: ev.target.value })} />
              </Field>
              <Field label="公司 / 机构">
                <input className="input" value={x.org ?? ""} onChange={(ev) => setExp(i, { org: ev.target.value })} />
              </Field>
              <Field label="所在部门（实习 / 工作，选填）">
                <input className="input" value={x.department ?? ""} onChange={(ev) => setExp(i, { department: ev.target.value })} />
              </Field>
              <Field label="开始">
                <input className="input" value={x.start ?? ""} onChange={(ev) => setExp(i, { start: ev.target.value })} />
              </Field>
              <Field label="结束">
                <input className="input" value={x.end ?? ""} onChange={(ev) => setExp(i, { end: ev.target.value })} />
              </Field>
              <Field label="技术栈 / 技能（逗号分隔）">
                <input className="input" value={x.skills.join("、")} onChange={(ev) => setExp(i, { skills: csv(ev.target.value).slice(0, 20) })} />
              </Field>
              <Field label="要点（每行一条，写清你做了什么、结果如何）" wide>
                <textarea className="input" rows={4} value={x.bullets.join("\n")} onChange={(ev) => setExp(i, { bullets: lines(ev.target.value).slice(0, 12) })} />
              </Field>
            </div>
            <button className="link-btn" onClick={() => set({ experiences: resume.experiences.filter((_, k) => k !== i) })}>
              删除这一条
            </button>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>专业技能</h2>
        </div>
        <input
          className="input"
          placeholder="用逗号分隔，如 Go、Redis、Kubernetes"
          value={resume.skills.join("、")}
          onChange={(e) => set({ skills: csv(e.target.value).slice(0, 40) })}
        />
      </section>
    </div>
  );
}
