import { loadJobs } from "../../../lib/jobsSource";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { jobs, mode } = await loadJobs();
    return Response.json({
      mode,
      // 列表里只给个预览，正文留在官网；被驳回的绝不展示
      jobs: jobs
        .filter((j) => j.reviewStatus !== "rejected")
        .map((j) => ({ ...j, description: j.description.slice(0, 300) })),
    });
  } catch (e) {
    const local = !process.env.SUPABASE_URL;
    return Response.json(
      { error: local ? "还没有岗位数据，请先在 apps/crawler 运行 npm run crawl" : `岗位数据暂时不可用：${(e as Error).message}` },
      { status: local ? 404 : 502 },
    );
  }
}
