"use client";

import { companyHue, companyName } from "../lib/companies";
import { dateLabel } from "../lib/jobMeta";
import type { Match } from "../lib/match";
import { TYPE_LABEL } from "../lib/profileForm";

const DEGREE = { bachelor: "本科及以上", master: "硕士及以上", phd: "博士" } as const;

interface Props {
  items: Match[];
  total: number;
  selected: ReadonlySet<string>;
  activeId?: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onMore: () => void;
}

export function CompanyTag({ id }: { id: string }) {
  const h = companyHue(id);
  return (
    <span
      className="company-tag"
      style={{ background: `hsl(${h} 70% 50% / 0.12)`, color: `hsl(${h} 55% 38%)` }}
    >
      <span className="dot" style={{ background: `hsl(${h} 65% 52%)` }} />
      {companyName(id)}
    </span>
  );
}

/** 公司的字母头像：取公司名第一个字，颜色和公司标签一致 */
export function CompanyAvatar({ id }: { id: string }) {
  const h = companyHue(id);
  return (
    <span className="co-avatar" aria-hidden style={{ background: `hsl(${h} 70% 50% / 0.14)`, color: `hsl(${h} 55% 38%)` }}>
      {companyName(id).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function JobList({ items, total, selected, activeId, onOpen, onToggle, onMore }: Props) {
  return (
    <>
      <ul className="jobs">
        {items.map(({ job, unknown }) => (
          <li
            key={job.id}
            className={`job-row${activeId === job.id ? " active" : ""}`}
            onClick={() => onOpen(job.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) onOpen(job.id);
            }}
            tabIndex={0}
            aria-label={`查看 ${job.title}`}
          >
            <input
              className="check"
              type="checkbox"
              aria-label={`选择 ${job.title}`}
              checked={selected.has(job.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggle(job.id)}
            />
            <div style={{ minWidth: 0 }}>
              <div className="jr-top">
                <h3 className="job-title">{job.title}</h3>
                {/* 手机卡片：右上角是发布时间，下面是标签和公司行（宽屏用原来的 job-meta） */}
                {dateLabel(job) && <span className="jr-date">{dateLabel(job)}</span>}
              </div>
              <div className="jr-tags">
                <span>{job.city.join(" / ") || "城市未标注"}</span>
                {job.requirements.minDegree && <span>{DEGREE[job.requirements.minDegree]}</span>}
                {job.requirements.graduationYears.length > 0 && <span>{job.requirements.graduationYears.join(" / ")} 届</span>}
                {job.reviewStatus !== "approved" && <span className="warn">未审核</span>}
                {unknown.length > 0 && <span className="warn">未识别：{unknown.join("、")}</span>}
              </div>
              <div className="jr-company">
                <CompanyAvatar id={job.companyId} />
                <b>{companyName(job.companyId)}</b>
                <span>{TYPE_LABEL[job.companyType]}</span>
                {selected.has(job.id) && <em>已选</em>}
              </div>
              <div className="job-meta">
                <CompanyTag id={job.companyId} />
                <span className="badge muted">{job.kind === "intern" ? "实习" : "校招"}</span>
                <span>{job.city.join(" / ") || "城市未标注"}</span>
                {dateLabel(job) && <span className="job-date">{dateLabel(job)}</span>}
                {job.reviewStatus !== "approved" && <span className="badge warn">未审核</span>}
                {unknown.length > 0 && <span className="badge warn">未识别：{unknown.join("、")}</span>}
              </div>
            </div>
            <span className="open-hint" aria-hidden>
              ›
            </span>
          </li>
        ))}
      </ul>
      {total > items.length && (
        <div className="more">
          <button className="btn ghost sm" onClick={onMore}>
            再显示 {Math.min(50, total - items.length)} 个（共 {total} 个）
          </button>
        </div>
      )}
    </>
  );
}
