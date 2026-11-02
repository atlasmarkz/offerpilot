import { loadJobs } from "../../../lib/jobsSource";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { jobs, mode } = await loadJobs();
    // 列表里只给个预览，正文留在官网；被驳回的绝不展示
    const visible = jobs
      .filter((j) => j.reviewStatus !== "rejected")
      .map((j) => ({ ...j, description: j.description.slice(0, 300) }));
    return Response.json(
      { mode, jobs: visible },
      {
        headers: {
          // 有数据才让 CDN 缓存 5 分钟；空结果绝不缓存，避免“同步了岗位页面还是空”
          "Cache-Control": visible.length > 0 ? "public, s-maxage=300, stale-while-revalidate=600" : "no-store",
        },
      },
    );
  } catch (e) {
    const local = !process.env.SUPABASE_URL;
    return Response.json(
      { error: local ? "还没有岗位数据，请先在 apps/crawler 运行 npm run crawl" : `岗位数据暂时不可用：${(e as Error).message}` },
      { status: local ? 404 : 502 },
    );
  }
}
