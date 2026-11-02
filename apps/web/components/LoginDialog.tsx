"use client";

import { useEffect, useRef, useState } from "react";
import type { AccountUser } from "../hooks/useCloudSync";

interface Props {
  onClose: () => void;
  onSuccess: (user: AccountUser) => void;
}

const RESEND_SECONDS = 60;

/** 邮箱验证码登录：先输入邮箱收验证码，再输入验证码。没有账号时自动注册。 */
export function LoginDialog({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function call(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function sendCode() {
    setBusy(true);
    setError(undefined);
    try {
      const { ok, data } = await call("/api/auth/send-code", { email });
      if (!ok) return setError(String(data.error ?? "发送失败"));
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch {
      setError("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(undefined);
    try {
      const { ok, data } = await call("/api/auth/verify", { email, code });
      if (!ok) return setError(String(data.error ?? "登录失败"));
      onSuccess(data.user as AccountUser);
    } catch {
      setError("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="link-btn modal-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <h2 id="login-title">登录 / 注册</h2>
        <p className="msg" style={{ color: "var(--muted)", marginTop: 0 }}>
          登录后，画像和已选岗位会保存到云端，换设备也能继续。没有账号会自动创建。
        </p>

        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void sendCode();
            }}
          >
            <label className="lbl" htmlFor="login-email">
              邮箱
            </label>
            <input
              id="login-email"
              ref={input}
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn block" style={{ marginTop: 14 }} disabled={busy || !email.includes("@")}>
              {busy ? "发送中…" : "获取验证码"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void verify();
            }}
          >
            <p className="msg" style={{ marginTop: 0 }}>
              验证码已发送到 <b>{email}</b>，请查收（可能在垃圾邮件里）。
            </p>
            <label className="lbl" htmlFor="login-code">
              验证码
            </label>
            <input
              id="login-code"
              ref={input}
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="6 位数字"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn block" style={{ marginTop: 14 }} disabled={busy || code.length < 6}>
              {busy ? "登录中…" : "登录"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <button type="button" className="link-btn" onClick={() => setStep("email")}>
                换个邮箱
              </button>
              <button type="button" className="link-btn" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>
                {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <p className="msg" style={{ color: "var(--faint)", marginBottom: 0 }}>
          登录即表示你同意<a href="/privacy">隐私说明</a>。我们只保存你的邮箱、画像和已选岗位，不保存简历文件。
        </p>
      </div>
    </div>
  );
}
