"use client";

import { useEffect, useRef, useState } from "react";
import type { AccountUser } from "../hooks/useSession";

export type AuthMode = "login" | "register";

interface Props {
  onClose: () => void;
  onSuccess: (user: AccountUser) => void;
  initial?: AuthMode;
}

type Step = "login" | "register" | "verify" | "forgot" | "reset";
const RESEND_SECONDS = 60;

/** 本站对密码的要求（服务端会再校验一次）。 */
function passwordProblem(pw: string): string | undefined {
  if (pw.length < 8) return "密码至少 8 位";
  if (pw.length > 72) return "密码不要超过 72 位";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "密码要同时包含字母和数字";
  return undefined;
}

/**
 * 登录 / 注册：邮箱 + 密码。注册和找回密码时，会给邮箱发一个验证码，验证码只用来确认邮箱是你的。
 * 发验证码的邮件有时要几秒甚至更久，所以点完就先进入输入验证码的一步，并显示等待进度，失败再退回。
 */
export function LoginDialog({ onClose, onSuccess, initial = "login" }: Props) {
  const [step, setStep] = useState<Step>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  /** 验证码邮件正在发送中（已经跳到验证步骤，但还没确认发出）：记起始时间用来显示已等待多久 */
  const [sendingSince, setSendingSince] = useState<number>();
  const [waited, setWaited] = useState(0);
  const [canVerify, setCanVerify] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), [step]);
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
  useEffect(() => {
    if (sendingSince === undefined) return;
    const t = setInterval(() => setWaited(Math.floor((Date.now() - sendingSince) / 1000)), 500);
    return () => clearInterval(t);
  }, [sendingSince]);

  async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  const go = (s: Step) => {
    setStep(s);
    setError(undefined);
  };

  /** 发验证码：先跳到下一步，后台发送；失败就退回上一步并提示。 */
  async function sendCodeThen(next: Step, back: Step, url: string, body: unknown) {
    setStep(next);
    setError(undefined);
    setCode("");
    setCanVerify(false);
    setSendingSince(Date.now());
    setWaited(0);
    try {
      const { ok, data } = await post(url, body);
      if (!ok) {
        setStep(back);
        setError(String(data.error ?? "发送失败"));
        return;
      }
      setCooldown(RESEND_SECONDS);
    } catch {
      setStep(back);
      setError("网络异常，请重试");
    } finally {
      setSendingSince(undefined);
    }
  }

  async function submit() {
    if (busy) return;
    setError(undefined);
    if (step === "login") {
      setBusy(true);
      try {
        const { ok, data } = await post("/api/auth/login", { email, password });
        if (!ok) {
          setError(String(data.error ?? "登录失败"));
          setCanVerify(String(data.error ?? "").includes("还没有验证"));
          return;
        }
        onSuccess(data.user as AccountUser);
      } catch {
        setError("网络异常，请重试");
      } finally {
        setBusy(false);
      }
    } else if (step === "register") {
      const bad = passwordProblem(password) ?? (password !== password2 ? "两次输入的密码不一致" : undefined);
      if (bad) return setError(bad);
      await sendCodeThen("verify", "register", "/api/auth/register", { email, password });
    } else if (step === "verify") {
      setBusy(true);
      try {
        const { ok, data } = await post("/api/auth/verify", { email, code });
        if (!ok) return setError(String(data.error ?? "验证失败"));
        onSuccess(data.user as AccountUser);
      } catch {
        setError("网络异常，请重试");
      } finally {
        setBusy(false);
      }
    } else if (step === "forgot") {
      await sendCodeThen("reset", "forgot", "/api/auth/forgot", { email });
    } else if (step === "reset") {
      const bad = passwordProblem(password) ?? (password !== password2 ? "两次输入的密码不一致" : undefined);
      if (bad) return setError(bad);
      setBusy(true);
      try {
        const { ok, data } = await post("/api/auth/reset", { email, code, password });
        if (!ok) return setError(String(data.error ?? "重设失败"));
        onSuccess(data.user as AccountUser);
      } catch {
        setError("网络异常，请重试");
      } finally {
        setBusy(false);
      }
    }
  }

  async function resend() {
    setCooldown(RESEND_SECONDS);
    setError(undefined);
    setSendingSince(Date.now());
    setWaited(0);
    try {
      const { ok, data } = await post("/api/auth/resend", { email, kind: step === "reset" ? "recovery" : "signup" });
      if (!ok) {
        setError(String(data.error ?? "发送失败"));
        setCooldown(0);
      }
    } catch {
      setError("网络异常，请重试");
      setCooldown(0);
    } finally {
      setSendingSince(undefined);
    }
  }

  const titles: Record<Step, string> = {
    login: "登录",
    register: "注册账号",
    verify: "验证邮箱",
    forgot: "找回密码",
    reset: "设置新密码",
  };
  const isCodeStep = step === "verify" || step === "reset";
  const needsPassword = step === "login" || step === "register" || step === "reset";
  const confirmPassword = step === "register" || step === "reset";
  const submitText: Record<Step, string> = {
    login: busy ? "登录中…" : "登录",
    register: "注册并获取验证码",
    verify: busy ? "验证中…" : "验证并完成注册",
    forgot: "获取验证码",
    reset: busy ? "提交中…" : "设置新密码并登录",
  };
  const disabled =
    busy ||
    !email.includes("@") ||
    (needsPassword && !password) ||
    (isCodeStep && code.length < 4);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="link-btn modal-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <h2 id="login-title">{titles[step]}</h2>

        {step === "register" && (
          <p className="msg" style={{ color: "var(--muted)", marginTop: 0 }}>
            用邮箱和密码注册。我们会给你的邮箱发一个验证码，用来确认这个邮箱是你的。
          </p>
        )}
        {step === "forgot" && (
          <p className="msg" style={{ color: "var(--muted)", marginTop: 0 }}>
            输入注册时用的邮箱，我们会发一个验证码，用它设置新密码。
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) void submit();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <label className="field">
            <span className="lbl">邮箱</span>
            <input
              ref={step === "login" || step === "register" || step === "forgot" ? first : undefined}
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              disabled={isCodeStep}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {isCodeStep && (
            <div className="field">
              <span className="lbl">邮箱验证码</span>
              <input
                ref={first}
                id="login-code"
                className="input code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="输入邮件里的验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <span className="msg" style={{ margin: 0, color: "var(--muted)" }} role="status">
                {sendingSince !== undefined ? (
                  <>
                    验证码邮件发送中…已等待 {waited} 秒。
                    {waited >= 10 && "邮件有时会慢一些，请耐心等一下，也看看垃圾邮件箱。"}
                  </>
                ) : (
                  <>
                    验证码已发送到 <b>{email}</b>，没收到请看垃圾邮件箱。
                    {step === "verify" && "如果这个邮箱以前登录过（旧版是验证码登录，没有设过密码），系统不会再发注册验证码，请返回登录页点“忘记密码”来设置密码。"}
                  </>
                )}
              </span>
            </div>
          )}

          {needsPassword && (
            <label className="field">
              <span className="lbl">{step === "reset" ? "新密码" : "密码"}</span>
              <span style={{ position: "relative", display: "block" }}>
                <input
                  id="login-password"
                  className="input"
                  type={showPw ? "text" : "password"}
                  autoComplete={step === "login" ? "current-password" : "new-password"}
                  placeholder={step === "login" ? "输入密码" : "至少 8 位，含字母和数字"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 56 }}
                />
                <button
                  type="button"
                  className="link-btn"
                  style={{ position: "absolute", right: 10, top: 9 }}
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "隐藏密码" : "显示密码"}
                >
                  {showPw ? "隐藏" : "显示"}
                </button>
              </span>
            </label>
          )}

          {confirmPassword && (
            <label className="field">
              <span className="lbl">再输入一次密码</span>
              <input
                id="login-password2"
                className="input"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>
          )}

          <button className="btn block" disabled={disabled}>
            {submitText[step]}
          </button>
        </form>

        {step === "login" && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button className="link-btn" onClick={() => go("forgot")}>
              忘记密码
            </button>
            <button className="link-btn" onClick={() => go("register")}>
              没有账号？注册
            </button>
          </div>
        )}
        {step === "register" && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button className="link-btn" onClick={() => go("login")}>
              已有账号？去登录
            </button>
          </div>
        )}
        {(step === "forgot" || step === "reset") && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button className="link-btn" onClick={() => go("login")}>
              返回登录
            </button>
          </div>
        )}
        {isCodeStep && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button className="link-btn" onClick={() => go(step === "verify" ? "register" : "forgot")}>
              改邮箱 / 返回
            </button>
            <button className="link-btn" disabled={cooldown > 0 || sendingSince !== undefined} onClick={() => void resend()}>
              {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}
            </button>
          </div>
        )}
        {canVerify && step === "login" && (
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <button
              className="btn ghost sm"
              onClick={() => {
                setStep("verify");
                setCode("");
                void resend();
              }}
            >
              去输入验证码完成验证
            </button>
          </div>
        )}

        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <p className="msg" style={{ color: "var(--faint)", marginBottom: 0 }}>
          继续即表示你同意<a href="/privacy">隐私说明</a>。我们只保存你的邮箱、画像、简历和投递记录，密码由登录服务加密保存，我们看不到。
        </p>
      </div>
    </div>
  );
}
