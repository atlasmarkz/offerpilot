"use client";

import type { Suggestions } from "../../lib/suggest";

const LEVEL_TEXT = { high: "重要", medium: "建议", low: "可选" } as const;

interface Props {
  suggestions?: Suggestions;
  /** 提示文字，如“已使用你自己的模型，不消耗额度” */
  note?: string;
}

export function SuggestPanel({ suggestions, note }: Props) {
  if (!suggestions) return null;
  return (
    <section className="panel no-print" aria-label="修改建议">
      <div className="panel-head">
        <h2>修改建议</h2>
        {note && <span className="hint">{note}</span>}
      </div>
      {suggestions.overall && <p style={{ marginTop: 0 }}>{suggestions.overall}</p>}
      <ul className="sug-list">
        {suggestions.items.map((it, i) => (
          <li key={i} className={`sug sug-${it.level}`}>
            <div className="sug-head">
              <span className={`badge${it.level === "high" ? " warn" : ""}`}>{LEVEL_TEXT[it.level]}</span>
              <b>{it.section}</b>
            </div>
            <div className="sug-problem">{it.problem}</div>
            <div>{it.suggestion}</div>
            {it.rewrite && (
              <div className="sug-rewrite">
                <span className="lbl">改写示例</span>
                {it.rewrite}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="msg" style={{ color: "var(--faint)" }}>
        建议由 AI 生成，只针对你已写的内容。方括号里的“请补充”处，请只填写真实的数据。
      </p>
    </section>
  );
}
