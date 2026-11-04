"use client";

import { PRIVATE_FIELDS, type PrivateInfo } from "@offerpilot/shared";

interface Props {
  info: PrivateInfo;
  onChange: (next: PrivateInfo) => void;
}

const GROUPS = ["身份", "联系", "其他"] as const;

/**
 * 个人隐私信息：只存在这台设备的浏览器里，不上传。
 * 字段就是各家投递页真实会问到的那些（来自 PRIVATE_FIELDS 目录），填一次，所有官方投递页都能用。
 */
export function PrivateInfoPanel({ info, onChange }: Props) {
  const set = (key: string, value: string) => {
    const next = { ...info };
    if (value.trim()) next[key] = value;
    else delete next[key];
    onChange(next);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>个人隐私信息</h2>
        <span className="hint">🔒 只存在这台电脑的浏览器里</span>
      </div>
      <p className="msg" style={{ marginTop: 0, color: "var(--muted)" }}>
        这些信息<b>不会上传到我们的服务器</b>，不会随账号同步，也不会发给大模型；填投递表单时由浏览器扩展在本机读取并填入。
        代价是换设备或清除浏览器数据后需要重新填写。
      </p>
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="lbl" style={{ margin: "10px 0 6px" }}>
            {g === "身份" ? "身份信息" : g === "联系" ? "联系方式" : "其他"}
          </div>
          <div className="form-grid">
            {PRIVATE_FIELDS.filter((f) => f.group === g).map((f) => (
              <label className="field" key={f.key} style={f.key === "个人链接" ? { gridColumn: "1 / -1" } : undefined}>
                <span className="lbl">{f.key}</span>
                {f.options ? (
                  <select className="input" value={info[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">未填写</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.key === "个人链接" ? (
                  <textarea className="input" rows={2} placeholder={f.hint} value={info[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input
                    className="input"
                    placeholder={f.hint}
                    autoComplete="off"
                    value={info[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
