import { join } from "node:path";
import { JobStore } from "./store";

const store = new JobStore(join(import.meta.dirname, "..", "data", "jobs.json"));
const [cmd, arg] = process.argv.slice(2);

function show(jobs: ReturnType<JobStore["list"]>): void {
  for (const j of jobs) {
    console.log(
      `${j.id.slice(0, 8)}  [${j.kind === "intern" ? "实习" : "正职"}] ${j.title}  ${j.city.join("/")}  截止 ${j.deadline ?? "未知"}`,
    );
    console.log(`          ${j.applyUrl}`);
  }
  console.log(`共 ${jobs.length} 条`);
}

switch (cmd) {
  case "list":
    show(store.list("pending"));
    break;
  case "approve":
  case "reject": {
    if (!arg) throw new Error(`用法: review ${cmd} <id前缀>`);
    const job = store.setStatus(arg, cmd === "approve" ? "approved" : "rejected");
    store.save();
    console.log(`${cmd === "approve" ? "已通过" : "已拒绝"}: ${job.title}`);
    break;
  }
  case "approved":
    show(store.list("approved"));
    break;
  default:
    console.log("用法: review list | approve <id> | reject <id> | approved");
}
