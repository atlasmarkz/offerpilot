import { join } from "node:path";
import { PLANS, isPlanId } from "@offerpilot/shared";
import { authHeaders } from "./sync";

/**
 * 管理员命令：给用户发次数、开通订阅、查看余额。只在你自己的电脑上用 service_role 密钥运行，
 * 支付接入之前用它手动发放额度；支付接入后，支付回调会调用同样的数据库函数。
 *
 *   npm run billing -w @offerpilot/crawler -- grant <邮箱> <次数>
 *   npm run billing -w @offerpilot/crawler -- subscribe <邮箱> [等级=plus] [天数=30]   等级: basic | plus | pro（额度按等级：30 / 100 / 300 次）
 *   npm run billing -w @offerpilot/crawler -- show <邮箱>
 */
async function main() {
  try {
    process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
  } catch {
    /* 没有 .env 就只用进程环境变量 */
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY（根目录 .env）");
  const origin = new URL(SUPABASE_URL.trim()).origin;
  const headers = { "Content-Type": "application/json", ...authHeaders(SUPABASE_SERVICE_KEY.trim()) };

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${origin}/rest/v1${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!res.ok) throw new Error(`请求失败 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : await res.json();
  };
  const rpc = (name: string, body: Record<string, unknown>) => call(`/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });

  const [cmd, email, a, b] = process.argv.slice(2);
  if (!cmd || !email) throw new Error("用法: grant <邮箱> <次数> | subscribe <邮箱> [basic|plus|pro] [天数] | show <邮箱>");

  const userId = (await rpc("admin_user_id", { p_email: email })) as string | null;
  if (!userId) throw new Error(`没有找到邮箱为 ${email} 的用户（对方需要先登录过一次）`);

  if (cmd === "grant") {
    const n = Number(a);
    if (!Number.isInteger(n) || n <= 0 || n > 100000) throw new Error("次数要是 1~100000 的整数");
    console.log(`已发放 ${n} 次，当前次数包余额 ${await rpc("grant_credits", { p_user: userId, p_amount: n })}`);
  } else if (cmd === "subscribe") {
    const plan = a ?? "plus";
    const days = b ? Number(b) : 30;
    if (!isPlanId(plan) || plan === "free") throw new Error("等级要是 basic、plus 或 pro");
    if (!Number.isInteger(days) || days <= 0) throw new Error("天数要是正整数");
    const quota = PLANS[plan].monthlyQuota;
    const end = new Date(Date.now() + days * 86400_000).toISOString();
    await rpc("set_subscription", { p_user: userId, p_plan: plan, p_quota: quota, p_period_end: end });
    console.log(`已开通 ${PLANS[plan].name}：额度 ${quota} 次，有效到 ${end.slice(0, 10)}（已用次数清零）`);
  } else if (cmd === "show") {
    console.log("次数包:", await call(`/wallet?user_id=eq.${userId}&select=credits`));
    console.log("订阅:", await call(`/subscription?user_id=eq.${userId}&select=plan,quota,used,period_end`));
    console.log("最近 5 条用量:", await call(`/usage_log?user_id=eq.${userId}&select=feature,units,source,status,created_at&order=created_at.desc&limit=5`));
  } else throw new Error(`不认识的命令 ${cmd}`);
}

if (process.argv[1]?.endsWith("billingAdmin.ts")) await main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
