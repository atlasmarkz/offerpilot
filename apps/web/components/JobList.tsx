"use client";

import { companyHue, companyName } from "../lib/companies";
import type { Match } from "../lib/match";

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
              <h3 className="job-title">{job.title}</h3>
              <div className="job-meta">
                <CompanyTag id={job.companyId} />
                <span className="badge muted">{job.kind === "intern" ? "实习" : "校招"}</span>
                <span>{job.city.join(" / ") || "城市未标注"}</span>
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
