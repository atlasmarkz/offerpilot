"use client";

import { useCallback, useEffect, useState } from "react";
import { ResumeEditor } from "../../components/resume/ResumeEditor";
import { ResumePreview } from "../../components/resume/ResumePreview";
import { SuggestPanel } from "../../components/resume/SuggestPanel";
import { TopBar } from "../../components/TopBar";
import { useResumeSync } from "../../hooks/useResumeSync";
import { useRequireLogin, useSession } from "../../hooks/useSession";
import { EMPTY_LLM, type LlmSettings } from "../../lib/profileForm";
import type { ResumeDraft } from "../../lib/resume";
import { postResumeToExtension } from "../../lib/extensionSync";
import { draftToResume, isBlankResume, RESUME_KEY } from "../../lib/resumeLocal";
import { emptyResume, normalizeResume, type ResumeData } from "../../lib/resumeData";
import { load, save } from "../../lib/storage";
import type { Suggestions } from "../../lib/suggest";

const LLM_KEY = "offerpilot.llm.v1";

/** 用户自己配置的模型（和岗位页的“模型设置”共用）；没填返回 undefined。 */
function readLlm(): LlmSettings | undefined {
  const l = load<LlmSettings | null>(LLM_KEY, null) ?? load<LlmSettings>(LLM_KEY, EMPTY_LLM, "session");
  return l.baseUrl && l.apiKey && l.model ? l : undefined;
}

type Msg = { ok: boolean; text: string };

export default function ResumePage() {
  const [resume, setResume] = useState<ResumeData>(emptyResume());
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [msg, setMsg] = useState<Msg>();
  const [targetRole, setTargetRole] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions>();
  const [suggestNote, setSuggestNote] = useState<string>();
  const [ownModel, setOwnModel] = useState(false);

  const session = useSession();
  const allowed = useRequireLogin(session);
  const applyCloud = useCallback((r: ResumeData) => setResume(r), []);
  const sync = useResumeSync({ user: session.user, resume, ready, apply: applyCloud, onSignedOut: session.signedOut });

  useEffect(() => {
    setResume(normalizeResume(load<unknown>(RESUME_KEY, {})));
    setOwnModel(!!readLlm());
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      save(RESUME_KEY, resume);
      // 已装扩展时顺带更新它手里的简历，不用再回岗位页点同步
      if (!isBlankResume(resume)) postResumeToExtension(resume);
    }
  }, [resume, ready]);

  const billing = session.usage.billing;
  const costHint = billing && !ownModel ? "本次将消耗 1 次额度" : ownModel ? "使用你自己的模型，不消耗额度" : "";

  function attachModel(put: (k: string, v: string) => void) {
    const l = readLlm();
    if (l) {
      put("llmBaseUrl", l.baseUrl);
      put("llmApiKey", l.apiKey);
      put("llmModel", l.model);
    }
    setOwnModel(!!l);
  }

  async function onParse(file: File) {
    if (!isBlankResume(resume) && !window.confirm("解析结果会替换当前的教育、经历和技能（联系方式保留）。继续吗？")) return;
    setParsing(true);
    setMsg(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "1");
      attachModel((k, v) => body.set(k, v));
      const res = await fetch("/api/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      const parsed = draftToResume(data.draft as ResumeDraft);
      setResume((r) => ({ ...parsed, contact: r.contact }));
      setMsg({ ok: true, text: "已解析并填入。请逐项核对，补充联系方式。" });
      void session.refreshUsage();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setParsing(false);
    }
  }

  async function onSuggest() {
    setSuggesting(true);
    setMsg(undefined);
    try {
      const payload: Record<string, unknown> = { resume, targetRole, consent: true };
      attachModel((k, v) => (payload[k] = v));
      const res = await fetch("/api/resume/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setSuggestions(data.suggestions as Suggestions);
      setSuggestNote(data.via === "user" ? "使用你自己的模型，未消耗额度" : billing ? "已消耗 1 次额度" : undefined);
      void session.refreshUsage();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSuggesting(false);
    }
  }

  const blank = isBlankResume(resume);

  if (!allowed) return <TopBar session={session} active="resume" />;

  return (
    <>
      <TopBar session={session} active="resume" status={sync.status} />
      <main className="app resume-app">
        {sync.conflict && (
          <div className="panel conflict no-print" role="alertdialog" aria-label="选择以哪份简历为准">
            <b>云端和这台设备上各有一份不同的简历。</b>
            <span>你想以哪份为准？选好之前不会覆盖任何一边。</span>
            <span className="conflict-actions">
              <button className="btn sm" onClick={() => void sync.resolveConflict("cloud")}>
                用云端的（覆盖本机）
              </button>
              <button className="btn ghost sm" onClick={() => void sync.resolveConflict("local")}>
                用本机的（覆盖云端）
              </button>
            </span>
          </div>
        )}

        <section className="panel no-print toolbar" aria-label="操作">
          <div className="toolbar-row">
            <label className="consent" style={{ margin: 0 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                我同意把简历内容发送给大模型服务做解析和建议（联系方式不会发送）。详见<a href="/privacy">隐私说明</a>。
              </span>
            </label>
          </div>
          <div className="toolbar-row">
            <label className={`btn ghost sm${!consent || parsing ? " disabled" : ""}`} aria-disabled={!consent || parsing}>
              {parsing ? "解析中…" : "📄 上传简历并解析"}
              <input
                type="file"
                hidden
                accept=".pdf,.docx,.txt,.md"
                disabled={!consent || parsing}
                aria-label="上传简历"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onParse(f);
                  e.target.value = "";
                }}
              />
            </label>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="目标岗位（可选，如 后端开发）"
              aria-label="目标岗位"
              value={targetRoleSafe(targetRole)}
              onChange={(e) => setTargetRole(e.target.value)}
            />
            <button className="btn sm" onClick={() => void onSuggest()} disabled={!consent || suggesting || blank}>
              {suggesting ? "分析中…" : "✨ 获取修改建议"}
            </button>
            <button className="btn ghost sm" onClick={() => window.print()} disabled={blank}>
              ⬇ 导出 PDF
            </button>
            <span className="msg" style={{ margin: 0, color: "var(--faint)" }}>
              {costHint}
            </span>
          </div>
          {msg && (
            <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status" style={{ marginBottom: 0 }}>
              {msg.text}
            </p>
          )}
          <p className="msg" style={{ color: "var(--faint)", marginBottom: 0 }}>
            {session.user
              ? sync.status === "saved"
                ? "已自动保存到云端（云端只保留最新一份，不保存原始文件）。"
                : "已登录，修改会自动保存到云端（只保留最新一份）。"
              : "未登录：简历只保存在本浏览器。登录后可以云端保存，换设备继续。"}{" "}
            导出时在打印窗口选择“另存为 PDF”。
          </p>
        </section>

        <div className="resume-grid">
          <div className="no-print">
            <SuggestPanel suggestions={suggestions} note={suggestNote} />
            <ResumeEditor resume={resume} onChange={setResume} />
          </div>
          <div className="resume-preview-col">
            <ResumePreview resume={resume} />
          </div>
        </div>
      </main>
    </>
  );
}

/** 目标岗位只取一行文字，避免把整段内容塞进去。 */
function targetRoleSafe(v: string): string {
  return v.replace(/[\r\n]+/g, " ").slice(0, 100);
}
