"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job, JobKind } from "@offerpilot/shared";
import { FilterBar } from "../../components/FilterBar";
import { JobDetail, SelectedPanel } from "../../components/JobDetail";
import { JobList } from "../../components/JobList";
import { ProfileCard, type ExtState } from "../../components/ProfileCard";
import { ResumePanel, type ResumePreview } from "../../components/ResumePanel";
import { applyFilter, EMPTY_FILTER, facets, type ListFilter } from "../../lib/filter";
import { TopBar } from "../../components/TopBar";
import { useCloudSync } from "../../hooks/useCloudSync";
import { useRequireLogin, useSession } from "../../hooks/useSession";
import { matchJobs } from "../../lib/match";
import { EMPTY_FORM, EMPTY_LLM, toProfile, type Form, type LlmSettings } from "../../lib/profileForm";
import type { ResumeDraft } from "../../lib/resume";
import { companyName } from "../../lib/companies";
import { draftToResume, RESUME_KEY } from "../../lib/resumeLocal";
import { flip, load, remove, save } from "../../lib/storage";

const PROFILE_KEY = "offerpilot.profile.v1";
const SELECTED_KEY = "offerpilot.selected.v1";
const UNREVIEWED_KEY = "offerpilot.unreviewed.v1";
const LLM_KEY = "offerpilot.llm.v1";
const PAGE = 50;

export default function Home() {
  const session = useSession();
  const allowed = useRequireLogin(session);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"file" | "supabase">("file");
  const [kind, setKind] = useState<JobKind>("fulltime");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [shown, setShown] = useState(PAGE);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(true);
  const [ext, setExt] = useState<ExtState>("unknown");

  const [llm, setLlm] = useState<LlmSettings>(EMPTY_LLM);
  const [consent, setConsent] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [resumeMsg, setResumeMsg] = useState<{ ok: boolean; text: string }>();
  const [preview, setPreview] = useState<ResumePreview>();
  const previewUrl = useRef<string>();

  // ---- 初始化：本地数据 + 岗位 ----
  useEffect(() => {
    setForm({ ...EMPTY_FORM, ...load<Partial<Form>>(PROFILE_KEY, {}) });
    setSelected(load<string[]>(SELECTED_KEY, []));
    setIncludeUnreviewed(load<boolean>(UNREVIEWED_KEY, true));
    // 记住的优先；否则取本次会话里填过的
    setLlm(load<LlmSettings | null>(LLM_KEY, null) ?? load<LlmSettings>(LLM_KEY, EMPTY_LLM, "session"));
    setReady(true);
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  // ---- 岗位：线上要登录后才能取，本地/自托管直接取 ----
  const canLoadJobs = allowed && (!session.enabled || !!session.user);
  useEffect(() => {
    if (!canLoadJobs || loaded) return;
    fetch("/api/jobs")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "加载岗位失败");
        setJobs(body.jobs);
        setMode(body.mode);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [canLoadJobs, loaded]);

  // ---- 浏览器扩展握手 ----
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; ok?: boolean } | null;
      if (e.source !== window || d?.source !== "offerpilot-ext") return;
      if (d.type === "ready") setExt((s) => (s === "unknown" ? "ready" : s));
      if (d.type === "profile-saved") setExt(d.ok ? "saved" : "failed");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => setExt((s) => (s === "saved" || s === "failed" ? "ready" : s)), [form]);

  // ---- 持久化（只在浏览器里）----
  useEffect(() => {
    if (ready) save(PROFILE_KEY, form);
  }, [form, ready]);
  useEffect(() => {
    if (ready) save(SELECTED_KEY, selected);
  }, [selected, ready]);
  useEffect(() => {
    if (ready) save(UNREVIEWED_KEY, includeUnreviewed);
  }, [includeUnreviewed, ready]);
  useEffect(() => {
    if (!ready) return;
    // 密钥只放在浏览器里：勾了“记住”存 localStorage，否则只存当前会话，关掉标签页就没了
    remove(LLM_KEY);
    if (llm.baseUrl || llm.apiKey || llm.model) save(LLM_KEY, llm, llm.remember ? "local" : "session");
  }, [llm, ready]);
  useEffect(() => setShown(PAGE), [form, kind, filter]);

  // Esc 关闭详情（窄屏上详情是浮层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveId(undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- 账号与云端同步 ----
  const applyCloud = useCallback((c: { profile: Form; selected: string[] }) => {
    setForm(c.profile);
    setSelected(c.selected);
  }, []);
  const sync = useCloudSync({
    user: session.user,
    form,
    selected,
    ready,
    apply: applyCloud,
    onSignedOut: session.signedOut,
  });

  // ---- 匹配与筛选 ----
  const profile = useMemo(() => toProfile(form), [form]);
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
  const filtered = useMemo(() => applyFilter(result.matches, filter, selectedSet), [result.matches, filter, selectedSet]);
  const filterActive =
    filter.query.trim() !== "" || filter.companies.length > 0 || filter.cities.length > 0 || filter.onlySelected;
  const rejectedTotal = Object.values(result.rejected).reduce((a, b) => a + b, 0);

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const chosen = useMemo(() => selected.map((id) => byId.get(id)).filter((j): j is Job => !!j), [selected, byId]);
  const active = activeId ? byId.get(activeId) : undefined;
  const toggle = useCallback((id: string) => setSelected((s) => flip(s, id)), []);
  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  // ---- 简历 ----
  const clearPreview = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
    setPreview(undefined);
  }, []);

  async function onResume(file: File) {
    setParsing(true);
    setResumeMsg(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "1");
      if (llm.baseUrl || llm.apiKey || llm.model) {
        body.set("llmBaseUrl", llm.baseUrl);
        body.set("llmApiKey", llm.apiKey);
        body.set("llmModel", llm.model);
      }
      const res = await fetch("/api/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      const d = data.draft as ResumeDraft;

      clearPreview();
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) previewUrl.current = URL.createObjectURL(file);
      setPreview({ name: file.name, kind: isPdf ? "pdf" : "text", url: previewUrl.current, text: data.text });

      save(RESUME_KEY, draftToResume(d));
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
        text: `已填入基础信息，识别到 ${d.experiences.length} 段经历。请在中间核对，识别不到的项保持原样。${
          data.truncated ? "（简历过长，只解析了前面一部分）" : ""
        }`,
      });
    } catch (e) {
      setResumeMsg({ ok: false, text: (e as Error).message });
    } finally {
      setParsing(false);
    }
  }

  async function addToBoard(job: Job): Promise<string> {
    const res = await fetch("/api/me/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, company: companyName(job.companyId), title: job.title, url: job.applyUrl }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? "已加入投递看板" : String(d.error ?? "添加失败");
  }

  function syncToExtension() {
    if (!profile.success) return;
    window.postMessage({ source: "offerpilot-web", type: "profile", profile: profile.data }, window.location.origin);
    // 1.5 秒内没有回执，说明没装扩展
    setTimeout(() => setExt((s) => (s === "ready" || s === "unknown" ? "unknown" : s)), 1500);
  }

  const emptyText = filterActive
    ? "没有符合筛选条件的岗位，试试清除部分筛选。"
    : !includeUnreviewed
      ? "还没有审核通过的岗位。可打开“包含未审核岗位”试用。"
      : "没有符合条件的岗位，试试放宽意向城市或检查毕业年份、学历。";

  if (!allowed) return <TopBar session={session} active="jobs" />;

  return (
    <>
      <TopBar session={session} active="jobs" status={sync.status}>
        {loaded && !error && (
          <span className="stat">
            <b>{result.matches.length}</b> 个可投 · 共 {jobs.length} 个岗位
          </span>
        )}
      </TopBar>

      <main className="app">
        {sync.conflict && (
          <div className="panel conflict" role="alertdialog" aria-label="选择以哪份数据为准">
            <b>云端和这台设备上都有数据，而且不一样。</b>
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
        <div className="grid3">
          <div className="col-side">
            <ResumePanel
              llm={llm}
              setLlm={setLlm}
              consent={consent}
              setConsent={setConsent}
              parsing={parsing}
              onFile={(f) => void onResume(f)}
              msg={resumeMsg}
              preview={preview}
              onClear={clearPreview}
              experiences={form.experiences}
            />
          </div>

          <div className="col-main">
            <ProfileCard
              form={form}
              set={set}
              ext={ext}
              canSync={profile.success}
              onSync={syncToExtension}
              cloud={!!session.user}
            />
            <FilterBar
              filter={filter}
              setFilter={setFilter}
              companies={companyFacets}
              cities={cityFacets}
              active={filterActive}
            />

            <section className="panel" aria-label="匹配岗位">
              <div className="list-head" style={{ marginBottom: 12 }}>
                <span className="seg" role="group" aria-label="岗位类型">
                  <button aria-pressed={kind === "fulltime"} onClick={() => setKind("fulltime")}>
                    全职
                  </button>
                  <button aria-pressed={kind === "intern"} onClick={() => setKind("intern")}>
                    实习
                  </button>
                </span>
                {loaded && !error && (
                  <span className="count">
                    {filterActive ? `筛出 ${filtered.length} / ` : ""}
                    {result.matches.length} 个可投 · 已排除 {rejectedTotal} 项不符
                  </span>
                )}
              </div>

              <div className={`notice${mode === "file" && includeUnreviewed ? " warn" : ""}`} style={{ marginBottom: 10 }}>
                {mode === "file" ? (
                  <>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={includeUnreviewed}
                        onChange={(e) => setIncludeUnreviewed(e.target.checked)}
                      />
                      包含未审核岗位
                    </label>
                    {" · "}
                    {includeUnreviewed ? "未审核岗位来自采集器，仅供试用。" : "只显示审核通过的岗位。"}
                  </>
                ) : (
                  "岗位来自官网公开页面，具体要求以官网为准。"
                )}
                {" "}标“未识别”的条件是岗位没写清楚，投递前请自己核对。
              </div>

              {error && <div className="empty">{error}</div>}
              {!error && !loaded && (
                <div className="skeleton" aria-label="加载中">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} />
                  ))}
                </div>
              )}
              {!error && loaded && jobs.length === 0 && (
                <div className="empty">
                  {mode === "supabase"
                    ? "数据库已连通，但还没有审核通过的岗位。"
                    : "还没有岗位数据，请先在 apps/crawler 运行 npm run crawl。"}
                </div>
              )}
              {!error && jobs.length > 0 && filtered.length === 0 && (
                <div className="empty">
                  <div className="em" aria-hidden>
                    🔍
                  </div>
                  {emptyText}
                </div>
              )}
              {!error && filtered.length > 0 && (
                <JobList
                  items={filtered.slice(0, shown)}
                  total={filtered.length}
                  selected={selectedSet}
                  activeId={activeId}
                  onOpen={setActiveId}
                  onToggle={toggle}
                  onMore={() => setShown((n) => n + PAGE)}
                />
              )}
            </section>
          </div>

          <div className={`col-side col-detail${active ? " open" : ""}`}>
            {active ? (
              <JobDetail
                job={active}
                profile={profile.success ? profile.data : undefined}
                picked={selectedSet.has(active.id)}
                onToggle={() => toggle(active.id)}
                onAddBoard={session.user ? () => addToBoard(active) : undefined}
                onClose={() => setActiveId(undefined)}
              />
            ) : (
              <SelectedPanel jobs={chosen} onOpen={setActiveId} onRemove={toggle} onClear={() => setSelected([])} />
            )}
          </div>
        </div>

        {chosen.length > 0 && (
          <div className="bar" role="region" aria-label="已选岗位">
            <span>已选 {chosen.length} 个</span>
            <button className="btn ghost sm" onClick={() => setSelected([])}>
              清空
            </button>
            <button
              className="btn sm"
              onClick={() => chosen.slice(0, 10).forEach((j) => window.open(j.applyUrl, "_blank", "noopener"))}
            >
              打开前 {Math.min(10, chosen.length)} 个 ↗
            </button>
          </div>
        )}
      </main>
    </>
  );
}
