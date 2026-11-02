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

const store = new JobStore(join(DATA_DIR, "jobs.json"));
const added = store.upsert(result.accepted);
store.save();

console.log(
  `抽取 ${result.accepted.length} 条，新增待审核 ${added} 条，重复 ${result.duplicates} 条，无效 ${result.invalid.length} 条`,
);
for (const e of result.sourceErrors) console.warn(`数据源失败 [${e.source}]: ${e.error}`);
for (const bad of result.invalid.slice(0, 5)) console.warn(`无效: ${bad.raw.sourceUrl}\n  ${bad.error.slice(0, 200)}`);
