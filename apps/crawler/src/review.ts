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
  case "summary": {
    // 按公司看审核进度，方便抽查后整家通过
    const rows = new Map<string, { pending: number; approved: number; rejected: number }>();
    for (const j of store.list()) {
      const r = rows.get(j.companyId) ?? { pending: 0, approved: 0, rejected: 0 };
      r[j.reviewStatus]++;
      rows.set(j.companyId, r);
    }
    for (const [id, r] of rows) console.log(`${id.padEnd(14)} 待审 ${r.pending}  已通过 ${r.approved}  已拒绝 ${r.rejected}`);
    break;
  }
  case "approve-company": {
    if (!arg) throw new Error("用法: review approve-company <companyId>（先用 summary 和 list 抽查再通过）");
    const n = store.setStatusWhere((j) => j.companyId === arg, "pending", "approved");
    store.save();
    console.log(`已通过 ${arg} 的 ${n} 条待审岗位`);
    break;
  }
  case "approved":
    show(store.list("approved"));
    break;
  default:
    console.log("用法: review list | summary | approve <id> | reject <id> | approve-company <companyId> | approved");
}
