"use client";

import type { CompanyType } from "@offerpilot/shared";
import { flip } from "../lib/storage";
import { SCHOOL_TAGS, TYPE_LABEL, type Form } from "../lib/profileForm";

export type ExtState = "unknown" | "ready" | "saved" | "failed" | "noreply";

interface Props {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  ext: ExtState;
  canSync: boolean;
  onSync: () => void;
  /** 已登录并开启云端同步 */
  cloud?: boolean;
}

const EXT_TEXT: Record<ExtState, string> = {
  saved: "已同步。打开岗位的投递页，点扩展图标“填写当前页面”。",
  failed: "同步失败：画像格式不对。",
  ready: "已检测到扩展，画像有改动后需要重新同步。",
  noreply: "扩展没有回应：请先刷新本页再点一次（扩展刚更新、重装或重新加载后，已打开的页面要刷新才能连上）。",
  unknown: "未安装扩展时点击没有效果。填写由扩展完成，提交仍由你自己点击。",
};

export function ProfileCard({ form, set, ext, canSync, onSync, cloud }: Props) {
  return (
    <section className="panel" aria-label="基础信息">
      <div className="panel-head">
        <span className="step">2</span>
        <h2>基础信息</h2>
        <span className="hint">决定你能看到哪些岗位 · {cloud ? "已登录，自动同步到云端" : "只保存在本浏览器"}</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="lbl" htmlFor="school">
            学校
          </label>
          <input
            id="school"
            className="input"
            type="text"
            placeholder="如 浙江大学"
            value={form.school}
            onChange={(e) => set("school", e.target.value)}
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="major">
            专业
          </label>
          <input
            id="major"
            className="input"
            type="text"
            placeholder="如 计算机科学与技术"
            value={form.major}
            onChange={(e) => set("major", e.target.value)}
          />
        </div>
        <div className="field">
          <span className="lbl">院校标签</span>
          <div className="chips">
            {SCHOOL_TAGS.map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={form.schoolTags.includes(t)}
                onClick={() => set("schoolTags", flip(form.schoolTags, t))}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="lbl" htmlFor="degree">
            学历
          </label>
          <select
            id="degree"
            className="input"
            value={form.degree}
            onChange={(e) => set("degree", e.target.value as Form["degree"])}
          >
            <option value="bachelor">本科</option>
            <option value="master">硕士</option>
            <option value="phd">博士</option>
          </select>
        </div>
        <div className="field">
          <label className="lbl" htmlFor="year">
            毕业年份
          </label>
          <input
            id="year"
            className="input"
            type="number"
            min={2024}
            max={2032}
            value={form.graduationYear}
            onChange={(e) => set("graduationYear", Number(e.target.value) || 2027)}
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="cities">
            意向城市（逗号分隔，留空不限）
          </label>
          <input
            id="cities"
            className="input"
            type="text"
            placeholder="上海, 杭州"
            value={form.cities}
            onChange={(e) => set("cities", e.target.value)}
          />
        </div>

        <div className="field span2">
          <label className="lbl" htmlFor="roles">
            意向岗位关键词（用于排序）
          </label>
          <input
            id="roles"
            className="input"
            type="text"
            placeholder="后端, 算法"
            value={form.targetRoles}
            onChange={(e) => set("targetRoles", e.target.value)}
          />
        </div>
        <div className="field">
          <span className="lbl">意向公司类型（用于排序）</span>
          <div className="chips">
            {(Object.keys(TYPE_LABEL) as CompanyType[]).map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={form.targetCompanyTypes.includes(t)}
                onClick={() => set("targetCompanyTypes", flip(form.targetCompanyTypes, t))}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn ghost sm" onClick={onSync} disabled={!canSync}>
          同步到浏览器扩展
        </button>
        <span className="msg" style={{ margin: 0, color: ext === "failed" || ext === "noreply" ? "var(--warn)" : "var(--faint)" }} role="status">
          {EXT_TEXT[ext]}
        </span>
      </div>
    </section>
  );
}
