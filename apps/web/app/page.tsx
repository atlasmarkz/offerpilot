"use client";

import { useEffect, useMemo, useState } from "react";
import { Profile, type CompanyType, type ExperienceAtom, type Job, type JobKind } from "@offerpilot/shared";
import { companyName } from "../lib/companies";
import { applyFilter, EMPTY_FILTER, facets, type ListFilter } from "../lib/filter";
import { matchJobs } from "../lib/match";
import type { ResumeDraft } from "../lib/resume";

const PROFILE_KEY = "offerpilot.profile.v1";
const SELECTED_KEY = "offerpilot.selected.v1";
const UNREVIEWED_KEY = "offerpilot.unreviewed.v1";
const PAGE = 50;

const TYPE_LABEL: Record<CompanyType, string> = { internet: "互联网", finance: "金融", soe: "国央企" };
const SCHOOL_TAGS = ["985", "211", "双一流"];

interface Form {
  name: string;
  school: string;
  schoolTags: string[];
  major: string;
  degree: "bachelor" | "master" | "phd";
  graduationYear: number;
  cities: string;
  targetRoles: string;
  targetCompanyTypes: CompanyType[];
  /** 从简历解析出的经历，后续用于定制简历和简答题 */
  experiences: ExperienceAtom[];
}

const EMPTY: Form = {
  name: "",
  school: "",
  schoolTags: [],
  major: "",
  degree: "bachelor",
  graduationYear: 2027,
  cities: "",
  targetRoles: "",
  targetCompanyTypes: [],
  experiences: [],
};

const split = (s: string) =>
  s
    .split(/[,，、\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等：只是不保存 */
  }
}

function flip<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function Home() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState<JobKind>("fulltime");
  const [selected, setSelected] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const [allCities, setAllCities] = useState(false);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(true);
  const [consent, setConsent] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [resumeMsg, setResumeMsg] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    setForm({ ...EMPTY, ...load<Partial<Form>>(PROFILE_KEY, {}) });
    setSelected(load<string[]>(SELECTED_KEY, []));
    setIncludeUnreviewed(load<boolean>(UNREVIEWED_KEY, true));
    setReady(true);
    fetch("/api/jobs")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "加载岗位失败");
        setJobs(body.jobs);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (ready) save(PROFILE_KEY, form);
  }, [form, ready]);
  useEffect(() => {
    if (ready) save(UNREVIEWED_KEY, includeUnreviewed);
  }, [includeUnreviewed, ready]);
  useEffect(() => {
    if (ready) save(SELECTED_KEY, selected);
  }, [selected, ready]);
  useEffect(() => setShown(PAGE), [form, kind, filter]);

  const profile = useMemo(
    () =>
      Profile.safeParse({
        ...form,
        cities: split(form.cities),
        targetRoles: split(form.targetRoles),
        name: form.name || "未命名",
        school: form.school || "-",
        major: form.major || "-",
      }),
    [form],
  );

  const result = useMemo(
    () =>
      profile.success
        ? matchJobs(profile.data, jobs, { kind, includeUnreviewed })
        : { matches: [], rejected: {} as Record<string, number> },
    [profile, jobs, kind, includeUnreviewed],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const companyFacets = useMemo(() => facets(result.matches, (m) => [m.job.companyId]), [result.matches]);
  const cityFacets = useMemo(() => facets(result.matches, (m) => m.job.city), [result.matches]);
  const filtered = useMemo(
    () => applyFilter(result.matches, filter, selectedSet),
    [result.matches, filter, selectedSet],
  );
  const filterActive =
    filter.query.trim() !== "" || filter.companies.length > 0 || filter.cities.length > 0 || filter.onlySelected;
  const toggleIn = (k: "companies" | "cities", v: string) => setFilter((f) => ({ ...f, [k]: flip(f[k], v) }));

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const chosen = selected.map((id) => byId.get(id)).filter((j): j is Job => !!j);
  const toggle = (id: string) => setSelected((s) => flip(s, id));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onResume(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setResumeMsg(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "1");
      const res = await fetch("/api/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      const d = data.draft as ResumeDraft;
      setForm((f) => ({
        ...f,
        school: d.school ?? f.school,
        schoolTags: d.schoolTags.length ? d.schoolTags : f.schoolTags,
        major: d.major ?? f.major,
        degree: d.degree ?? f.degree,
        graduationYear: d.graduationYear ?? f.graduationYear,
        cities: d.cities.length ? d.cities.join(", ") : f.cities,
        targetRoles: d.targetRoles.length ? d.targetRoles.join(", ") : f.targetRoles,
        experiences: d.experiences,
      }));
      setResumeMsg({
        ok: true,
        text: `已填入，识别到 ${d.experiences.length} 段经历。请逐项核对下面的内容，识别不到的项保持原样。${
          data.truncated ? "（简历过长，只解析了前面一部分）" : ""
        }`,
      });
    } catch (e) {
      setResumeMsg({ ok: false, text: (e as Error).message });
    } finally {
      setParsing(false);
    }
  }

  const rejectedTotal = Object.values(result.rejected).reduce((a, b) => a + b, 0);

  return (
    <main className="wrap">
      <h1>OfferPilot</h1>
      <p className="sub">填写画像，只看你真正满足硬条件的校招 / 实习岗位。画像和勾选只保存在你的浏览器里。</p>

      <div className="layout">
        <section className="card" aria-label="我的画像">
          <h2>我的画像</h2>
          <div className="field">
            <span className="lbl">上传简历自动填写（PDF / Word / txt）</span>
            <label className="chips" style={{ gap: 6, alignItems: "flex-start", fontSize: 12, color: "var(--muted)" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>我同意把简历里的文字发送给本机配置的大模型服务做解析。文件不会被保存，也不会上传到别处。</span>
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              disabled={!consent || parsing}
              aria-label="上传简历"
              onChange={(e) => {
                void onResume(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {parsing && <span className="meta">解析中，请稍候…</span>}
            {resumeMsg && (
              <span className="meta" style={{ color: resumeMsg.ok ? "var(--brand)" : "var(--warn)" }} role="status">
                {resumeMsg.text}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="school">学校</label>
            <input id="school" type="text" value={form.school} onChange={(e) => set("school", e.target.value)} />
          </div>
          <div className="field">
            <span className="lbl">院校标签</span>
            <div className="chips">
              {SCHOOL_TAGS.map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={form.schoolTags.includes(t)}
                    onChange={() => set("schoolTags", flip(form.schoolTags, t))}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="major">专业</label>
            <input
              id="major"
              type="text"
              placeholder="如 计算机科学与技术"
              value={form.major}
              onChange={(e) => set("major", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="degree">学历</label>
            <select id="degree" value={form.degree} onChange={(e) => set("degree", e.target.value as Form["degree"])}>
              <option value="bachelor">本科</option>
              <option value="master">硕士</option>
              <option value="phd">博士</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="year">毕业年份</label>
            <input
              id="year"
              type="number"
              min={2024}
              max={2032}
              value={form.graduationYear}
              onChange={(e) => set("graduationYear", Number(e.target.value) || 2027)}
            />
          </div>
          <div className="field">
            <label htmlFor="cities">意向城市（逗号分隔，留空不限）</label>
            <input
              id="cities"
              type="text"
              placeholder="上海, 杭州"
              value={form.cities}
              onChange={(e) => set("cities", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="roles">意向岗位关键词（用于排序）</label>
            <input
              id="roles"
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
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={form.targetCompanyTypes.includes(t)}
                    onChange={() => set("targetCompanyTypes", flip(form.targetCompanyTypes, t))}
                  />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="匹配岗位">
          <div className="tabs">
            <button className="tab" aria-pressed={kind === "fulltime"} onClick={() => setKind("fulltime")}>
              全职
            </button>
            <button className="tab" aria-pressed={kind === "intern"} onClick={() => setKind("intern")}>
              实习
            </button>
            <span className="meta">
              {error || jobs.length === 0
                ? ""
                : `${filterActive ? `筛出 ${filtered.length} / ` : ""}${result.matches.length} 个可投 / 已排除 ${rejectedTotal} 项不符`}
            </span>
          </div>

          <div className="note">
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={includeUnreviewed}
                onChange={(e) => setIncludeUnreviewed(e.target.checked)}
              />
              包含未审核岗位
            </label>
            {" · "}
            {includeUnreviewed
              ? "未审核岗位来自采集器、尚未人工核对，仅供试用。"
              : "只显示人工审核通过的岗位（在 apps/crawler 里用 review 命令审核）。"}
            标“未识别”的条件是岗位没写清楚，投递前请自己核对。
          </div>

          {jobs.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }} role="search" aria-label="检索与筛选">
              <input
                type="text"
                placeholder="搜索岗位、公司、城市或职责关键词（空格分隔，需全部命中）"
                aria-label="搜索岗位"
                value={filter.query}
                onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
              />
              <div className="field" style={{ marginTop: 12 }}>
                <span className="lbl">公司</span>
                <div className="chips">
                  {companyFacets.map(({ value, count }) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={filter.companies.includes(value)}
                        onChange={() => toggleIn("companies", value)}
                      />
                      {companyName(value)} {count}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="lbl">城市</span>
                <div className="chips">
                  {(allCities ? cityFacets : cityFacets.slice(0, 12)).map(({ value, count }) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={filter.cities.includes(value)}
                        onChange={() => toggleIn("cities", value)}
                      />
                      {value} {count}
                    </label>
                  ))}
                  {cityFacets.length > 12 && (
                    <button className="tab" onClick={() => setAllCities((v) => !v)}>
                      {allCities ? "收起" : `更多 ${cityFacets.length - 12} 个`}
                    </button>
                  )}
                </div>
              </div>
              <div className="chips" style={{ alignItems: "center" }}>
                <label>
                  <input
                    type="checkbox"
                    checked={filter.onlySelected}
                    onChange={(e) => setFilter((f) => ({ ...f, onlySelected: e.target.checked }))}
                  />
                  只看已选
                </label>
                {filterActive && (
                  <button className="btn ghost" onClick={() => setFilter(EMPTY_FILTER)}>
                    清除筛选
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <div className="card empty">{error}</div>}
          {!error && jobs.length === 0 && <div className="card empty">加载中…</div>}
          {jobs.length > 0 && (
            <div className="card">
              {filtered.length === 0 && (
                <div className="empty">
                  {filterActive
                    ? "没有符合筛选条件的岗位，试试清除部分筛选。"
                    : !includeUnreviewed
                      ? "还没有审核通过的岗位。可勾选“包含未审核岗位”试用，或先在 apps/crawler 里审核。"
                      : "没有符合条件的岗位，试试放宽意向城市。"}
                </div>
              )}
              {filtered.slice(0, shown).map(({ job, unknown }) => (
                <div className="job" key={job.id}>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${job.title}`}
                    checked={selected.includes(job.id)}
                    onChange={() => toggle(job.id)}
                  />
                  <div>
                    <h3>
                      <a href={job.applyUrl} target="_blank" rel="noreferrer">
                        {job.title}
                      </a>
                    </h3>
                    <div className="meta">
                      <span className="badge">{companyName(job.companyId)}</span>
                      {job.reviewStatus !== "approved" && <span className="badge warn">未审核</span>}
                      {job.city.join(" / ") || "城市未标注"}
                      {unknown.length > 0 && (
                        <span className="badge warn" style={{ marginLeft: 6 }}>
                          未识别：{unknown.join("、")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length > shown && (
                <div style={{ textAlign: "center", paddingTop: 12 }}>
                  <button className="btn ghost" onClick={() => setShown((n) => n + PAGE)}>
                    再显示 {Math.min(PAGE, filtered.length - shown)} 个
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {chosen.length > 0 && (
        <div className="bar" role="region" aria-label="已选岗位">
          <span>已选 {chosen.length} 个岗位</span>
          <button className="btn ghost" onClick={() => setSelected([])}>
            清空
          </button>
          <button
            className="btn"
            onClick={() => chosen.slice(0, 10).forEach((j) => window.open(j.applyUrl, "_blank", "noopener"))}
          >
            打开前 {Math.min(10, chosen.length)} 个投递页
          </button>
        </div>
      )}
    </main>
  );
}
