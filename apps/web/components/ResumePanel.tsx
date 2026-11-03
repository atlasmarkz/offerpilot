"use client";

import { useState } from "react";
import type { ExperienceAtom } from "@offerpilot/shared";
import { EMPTY_LLM, type LlmSettings } from "../lib/profileForm";

export interface ResumePreview {
  name: string;
  /** pdf 用浏览器自带的阅读器原样预览；其余格式显示提取出的文字 */
  kind: "pdf" | "text";
  url?: string;
  text?: string;
}

const KIND_LABEL: Record<ExperienceAtom["kind"], string> = {
  project: "项目",
  internship: "实习",
  research: "科研",
  award: "奖项",
  campus: "校园",
};

interface Props {
  llm: LlmSettings;
  setLlm: (f: (l: LlmSettings) => LlmSettings) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  parsing: boolean;
  onFile: (file: File) => void;
  msg?: { ok: boolean; text: string };
  preview?: ResumePreview;
  onClear: () => void;
  experiences: ExperienceAtom[];
}

export function ResumePanel({
  llm,
  setLlm,
  consent,
  setConsent,
  parsing,
  onFile,
  msg,
  preview,
  onClear,
  experiences,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [llmMsg, setLlmMsg] = useState<{ ok: boolean; text: string }>();
  const [showText, setShowText] = useState(false);
  const [drag, setDrag] = useState(false);
  const disabled = !consent || parsing;
  // 手机浏览器等不能在页面里内嵌 PDF：此时直接显示提取出的文字
  const canEmbedPdf = typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

  async function testLlm() {
    setTesting(true);
    setLlmMsg(undefined);
    try {
      const res = await fetch("/api/llm-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmBaseUrl: llm.baseUrl, llmApiKey: llm.apiKey, llmModel: llm.model }),
      });
      const data = await res.json();
      setLlmMsg(res.ok ? { ok: true, text: "连接成功，可以用来解析简历了。" } : { ok: false, text: data.error ?? "测试失败" });
    } catch {
      setLlmMsg({ ok: false, text: "测试失败，请检查网络" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="panel" aria-label="我的简历">
      <div className="panel-head">
        <span className="step">1</span>
        <h2>我的简历</h2>
        <span className="hint">可选 · 自动填写画像</span>
      </div>

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          我同意把简历里的文字发送给大模型服务做解析，文件不会被保存。详见<a href="/privacy">隐私说明</a>。
        </span>
      </label>

      <label
        className="dropzone"
        aria-disabled={disabled}
        style={drag && !disabled ? { background: "var(--brand-soft)" } : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f && !disabled) onFile(f);
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden>
          {parsing ? "⏳" : "📄"}
        </span>
        <span className="big">{parsing ? "解析中，请稍候…" : preview ? "重新上传简历" : "点击或拖入简历"}</span>
        <span className="small">{consent ? "PDF / Word(.docx) / txt，不超过 5MB" : "请先勾选上方同意"}</span>
        <input
          type="file"
          hidden
          accept=".pdf,.docx,.txt,.md"
          aria-label="上传简历"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {msg && (
        <p className={`msg ${msg.ok ? "ok" : "err"}`} role="status">
          {msg.text}
        </p>
      )}

      {preview && (
        <div className="preview">
          <div className="preview-head">
            <span className="name" title={preview.name}>
              {preview.name}
            </span>
            {preview.kind === "pdf" && preview.text && canEmbedPdf && (
              <button className="link-btn" onClick={() => setShowText((v) => !v)}>
                {showText ? "看原文件" : "看提取文字"}
              </button>
            )}
            <button className="link-btn" onClick={onClear}>
              移除
            </button>
          </div>
          {preview.kind === "pdf" && preview.url && canEmbedPdf && !showText ? (
            <iframe src={preview.url} title="简历预览" />
          ) : (
            <pre>{preview.text}</pre>
          )}
        </div>
      )}
      {preview && (
        <p className="msg" style={{ color: "var(--faint)" }}>
          预览只在当前页面保留，刷新或关闭后消失，不会上传保存。
        </p>
      )}

      {experiences.length > 0 && (
        <details className="fold" open>
          <summary>识别到的经历（{experiences.length}）</summary>
          <div className="exp">
            {experiences.map((x, i) => (
              <div className="exp-item" key={i}>
                <span className="badge">{KIND_LABEL[x.kind]}</span> <b>{x.title}</b>
                <div className="m">
                  {[x.org, [x.start, x.end].filter(Boolean).join(" ~ ")].filter(Boolean).join(" · ")}
                </div>
                {x.skills.length > 0 && <div className="m">技能：{x.skills.join("、")}</div>}
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="fold">
        <summary>
          模型设置
          {llm.baseUrl.trim() && llm.apiKey.trim() && llm.model.trim()
            ? "（使用你自己的模型）"
            : llm.baseUrl || llm.apiKey || llm.model
              ? "（没填全，将使用站点模型）"
              : "（可选：用你自己的大模型解析）"}
        </summary>
        <div className="body">
          <input
            className="input"
            type="text"
            aria-label="Base URL"
            placeholder="Base URL，如 https://api.openai.com/v1"
            value={llm.baseUrl}
            onChange={(e) => setLlm((l) => ({ ...l, baseUrl: e.target.value }))}
          />
          <input
            className="input"
            type="password"
            aria-label="API Key"
            autoComplete="off"
            placeholder="API Key"
            value={llm.apiKey}
            onChange={(e) => setLlm((l) => ({ ...l, apiKey: e.target.value }))}
          />
          <input
            className="input"
            type="text"
            aria-label="模型名"
            placeholder="模型名，如 gpt-4o-mini"
            value={llm.model}
            onChange={(e) => setLlm((l) => ({ ...l, model: e.target.value }))}
          />
          <label className="consent" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={llm.remember}
              onChange={(e) => setLlm((l) => ({ ...l, remember: e.target.checked }))}
            />
            <span>在这个浏览器里记住（不勾选则关闭标签页后清除）</span>
          </label>
          <span className="msg" style={{ color: "var(--faint)", margin: 0 }}>
            支持任何兼容 OpenAI 接口的服务。密钥只保存在你的浏览器里，解析时随请求转发给你填的地址，我们不保存、不记录。
          </span>
          <div className="chips">
            <button className="btn sm" onClick={testLlm} disabled={testing || !llm.baseUrl || !llm.apiKey || !llm.model}>
              {testing ? "测试中…" : "测试连接"}
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                setLlm(() => EMPTY_LLM);
                setLlmMsg(undefined);
              }}
            >
              清除
            </button>
          </div>
          {llmMsg && (
            <span className={`msg ${llmMsg.ok ? "ok" : "err"}`} role="status" style={{ margin: 0 }}>
              {llmMsg.text}
            </span>
          )}
        </div>
      </details>
    </section>
  );
}
