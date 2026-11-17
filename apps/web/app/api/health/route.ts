export const dynamic = "force-dynamic";

/**
 * 健康检查：给 Docker / 负载均衡 / 监控用。只说明服务在跑、哪些功能配置了，不连数据库、不返回任何密钥。
 */
export async function GET() {
  const has = (k: string) => !!process.env[k]?.trim();
  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      configured: {
        database: has("SUPABASE_URL") && has("SUPABASE_ANON_KEY"),
        serviceKey: has("SUPABASE_SERVICE_KEY"),
        llm: has("LLM_BASE_URL") && has("LLM_API_KEY") && has("LLM_MODEL"),
        billing: process.env.BILLING_ENABLED === "1",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
