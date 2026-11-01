import { join } from "node:path";
import { llmConfigFromEnv, createLlmExtractor } from "./extract";
import { runPipeline, type SourceAdapter } from "./pipeline";
import { loadSourceConfigs, pageSource } from "./sources";
import { JobStore } from "./store";

try {
  process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
} catch {
  /* 没有 .env 时依赖已有的环境变量 */
}

const DATA_DIR =join(import.meta.dirname, "..", "data");
const configs = loadSourceConfigs(join(import.meta.dirname, "..", "sources.json")).filter((c) => c.enabled);

if (configs.length === 0) {
  console.log("sources.json 里没有启用的数据源，请先填写后再运行。");
  process.exit(0);
}

const sources: SourceAdapter[] = configs.map(pageSource);
const result = await runPipeline(sources, createLlmExtractor(llmConfigFromEnv()));

const store = new JobStore(join(DATA_DIR, "jobs.json"));
const added = store.upsert(result.accepted);
store.save();

console.log(
  `抽取 ${result.accepted.length} 条，新增待审核 ${added} 条，重复 ${result.duplicates} 条，无效 ${result.invalid.length} 条`,
);
for (const bad of result.invalid.slice(0, 5)) console.warn(`无效: ${bad.raw.sourceUrl}\n  ${bad.error.slice(0, 200)}`);
