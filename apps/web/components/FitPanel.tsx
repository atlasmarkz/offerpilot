"use client";

import type { FitResult } from "../lib/fit";

const VERDICT = {
  apply: { text: "建议投递", tone: "ok" },
  maybe: { text: "可以试试，先补差距", tone: "mid" },
  skip: { text: "不太建议投", tone: "warn" },
} as const;

/** 岗位匹配度评估的结果：分数、结论、亮点（带简历原文证据）、差距、简历该突出什么、可能的面试题。 */
export function FitResultView({ fit, note }: { fit: FitResult; note?: string }) {
  const v = VERDICT[fit.verdict];
  return (
    <div className="fit" aria-label="匹配度评估结果">
      <div className={`fit-head ${v.tone}`}>
        <b className="fit-score" aria-label={`匹配度 ${fit.score} 分（满分 5 分）`}>
          {fit.score}
          <small>/5</small>
        </b>
        <div>
          <b>{v.text}</b>
          {fit.summary && <p>{fit.summary}</p>}
        </div>
      </div>
      {fit.flags.length > 0 && (
        <p className="fit-flag" role="note">
          岗位描述安全检查：{fit.flags.join("；")}
        </p>
      )}
      {fit.strengths.length > 0 && (
        <>
          <div className="sec-title">匹配的地方</div>
          <ul className="fit-list ok">
            {fit.strengths.map((s, i) => (
              <li key={i}>
                <b>{s.requirement}</b>
                <span>简历里：“{s.evidence}”</span>
                {s.unverified?.length ? <em>⚠ 简历里没有找到：{s.unverified.join("、")}，请核实</em> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {fit.gaps.length > 0 && (
        <>
          <div className="sec-title">差距与建议</div>
          <ul className="fit-list gap">
            {fit.gaps.map((g, i) => (
              <li key={i}>
                <b>{g.requirement}</b>
                <span>{g.advice}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {fit.focus.length > 0 && (
        <>
          <div className="sec-title">投这个岗位，简历要突出</div>
          <ul className="fit-bullets">
            {fit.focus.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}
      {fit.interview.length > 0 && (
        <>
          <div className="sec-title">面试可能会问</div>
          <ul className="fit-bullets">
            {fit.interview.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      )}
      <p className="msg" style={{ color: "var(--faint)" }}>
        评估由 AI 生成，只依据你简历里写了的内容；分数仅供参考，投不投由你决定。{note ? ` ${note}` : ""}
      </p>
    </div>
  );
}
