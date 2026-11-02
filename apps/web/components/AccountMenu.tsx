"use client";

import { useState } from "react";
import type { AccountUser, SyncStatus } from "../hooks/useCloudSync";

interface Props {
  user: AccountUser | null;
  status: SyncStatus;
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

export function AccountMenu({ user, status, onLogin, onLogout, onDelete }: Props) {
  const [msg, setMsg] = useState<string>();

  if (!user)
    return (
      <button className="btn sm" onClick={onLogin}>
        登录 / 注册
      </button>
    );

  const initial = (user.email[0] ?? "?").toUpperCase();

  async function del() {
    const ok = window.confirm("确定删除账号吗？你的邮箱、云端保存的画像和已选岗位都会被永久删除，无法恢复。\n（本浏览器里的数据不受影响）");
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
        <div className={`acct-status${status === "error" ? " err" : ""}`} role="status">
          {STATUS_TEXT[status]}
        </div>
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
