"use client";

import { useState } from "react";
import type { SyncStatus } from "../hooks/useCloudSync";
import type { AccountUser, UsageInfo } from "../hooks/useSession";

interface Props {
  user: AccountUser | null;
  status?: SyncStatus;
  usage: UsageInfo;
  onLogin: () => void;
  onLogout: () => void;
  onDelete: () => Promise<boolean>;
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: "云端同步已开启",
  saving: "正在保存到云端…",
  saved: "已同步到云端",
  error: "云端同步失败，稍后会重试",
};

export function UsageLine({ usage }: { usage: UsageInfo }) {
  if (!usage.billing) return null;
  const end = usage.periodEnd ? usage.periodEnd.slice(0, 10) : "";
  return (
    <div className="acct-usage">
      <div>
        <b>{usage.plan === "pro" ? "订阅会员" : "免费账号"}</b>
        {usage.plan === "pro" && (
          <span>
            {" "}
            · 本期剩余 {usage.remaining}/{usage.quota} 次{end && `（${end} 到期）`}
          </span>
        )}
      </div>
      <div>次数包：{usage.credits ?? 0} 次</div>
    </div>
  );
}

export function AccountMenu({ user, status, usage, onLogin, onLogout, onDelete }: Props) {
  const [msg, setMsg] = useState<string>();

  if (!user)
    return (
      <button className="btn sm" onClick={onLogin}>
        登录 / 注册
      </button>
    );

  const initial = (user.email[0] ?? "?").toUpperCase();

  async function del() {
    const ok = window.confirm(
      "确定删除账号吗？你的邮箱、云端保存的画像、已选岗位和简历都会被永久删除，剩余的额度也会作废，无法恢复。\n（本浏览器里的数据不受影响）",
    );
    if (!ok) return;
    setMsg(undefined);
    if (!(await onDelete())) setMsg("删除失败，请稍后重试");
  }

  return (
    <details className="acct">
      <summary aria-label="账号菜单">
        <span className="avatar" aria-hidden>
          {initial}
        </span>
        <span className="acct-email">{user.email}</span>
      </summary>
      <div className="acct-pop">
        <UsageLine usage={usage} />
        {status && (
          <div className={`acct-status${status === "error" ? " err" : ""}`} role="status">
            {STATUS_TEXT[status]}
          </div>
        )}
        <button className="acct-item" onClick={onLogout}>
          退出登录
        </button>
        <button className="acct-item danger" onClick={() => void del()}>
          删除账号和云端数据
        </button>
        {msg && <div className="acct-status err">{msg}</div>}
      </div>
    </details>
  );
}
