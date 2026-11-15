import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { closeBrowser } from "./browser";
import { createLlmExtractor, llmConfigFromEnv } from "./extract";
import { runPipeline, type Extractor } from "./pipeline";
import { createSource, loadSourceConfigs } from "./sources";
import { JobStore } from "./store";

try {
  process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
} catch {
  /* 没有 .env 时依赖已有的环境变量 */
}

const DATA_DIR = join(import.meta.dirname, "..", "data");

// 用法: npm run crawl -w @offerpilot/crawler [-- --only <数据源id>]
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;

const configs = loadSourceConfigs(join(import.meta.dirname, "..", "sources.json")).filter(
  (c) => c.enabled && (!only || c.id === only),
);

if (configs.length === 0) {
  console.log("没有可运行的数据源（检查 sources.json 的 enabled，或 --only 的 id）。");
  process.exit(0);
}

// 只有网页文字类的数据源才需要大模型，结构化站点不需要密钥
let llm: Extractor | undefined;
const extract: Extractor = (raw) => (llm ??= createLlmExtractor(llmConfigFromEnv()))(raw);

let result;
try {
  result = await runPipeline(configs.map(createSource), extract);
} finally {
  // 不关闭浏览器的话 Node 进程不会退出
  await closeBrowser();
}

const at = new Date().toISOString();
const store = new JobStore(join(DATA_DIR, "jobs.json"));
store.backfillSource(new Map(loadSourceConfigs(join(import.meta.dirname, "..", "sources.json")).map((c) => [c.url, c.id])));
const added = store.upsert(result.accepted, at);
// --only 只跑了一个数据源：其他数据源这次没采集，不参与下架判断（planFreshness 只看 run 里出现的数据源）
const fresh = store.applyRun(result.sources, at);
store.save();
// 这次运行的结果：同步到数据库时用来判断哪些岗位“刚确认在招”、哪些数据源取全了
writeFileSync(join(DATA_DIR, "last-run.json"), JSON.stringify({ at, sources: result.sources, errors: result.sourceErrors }, null, 2), "utf8");

console.log(
  `抽取 ${result.accepted.length} 条，新增 ${added} 条，重复 ${result.duplicates} 条，无效 ${result.invalid.length} 条；` +
    `下架 ${fresh.closed} 条，暂时没找到 ${fresh.missed} 条，恢复 ${fresh.reopened} 条`,
);
for (const s of result.sources) console.log(`  ${s.id.padEnd(20)} ${String(s.ids.length).padStart(4)} 条  ${s.complete ? "已取全" : "未取全（不据此判断下架）"}`);
for (const e of result.sourceErrors) console.warn(`数据源失败 [${e.source}]: ${e.error}`);
for (const bad of result.invalid.slice(0, 5)) console.warn(`无效: ${bad.raw.sourceUrl}\n  ${bad.error.slice(0, 200)}`);
