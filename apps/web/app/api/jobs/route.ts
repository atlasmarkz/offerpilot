import { jsonWith, resolveSession } from "../../../lib/auth/session";
import { authConfig } from "../../../lib/auth/supabaseAuth";
import { loadJobs } from "../../../lib/jobsSource";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 开了账号功能（线上托管）时，岗位数据需要登录后才能获取；本地/自托管没有账号体系，不拦
  if (authConfig()) {
    const session = await resolveSession(req).catch(() => undefined);
    if (!session) return jsonWith({ error: "请先登录", code: "login_required" }, { status: 401 });
  }
  try {
    const { jobs, mode } = await loadJobs();
    // 只给要点预览（右侧详情用），完整正文留在官网；被驳回的绝不展示
    const visible = jobs
      .filter((j) => j.reviewStatus !== "rejected")
      .map((j) => ({ ...j, description: j.description.slice(0, 600) }));
    return Response.json(
      { mode, jobs: visible },
      {
        headers: {
          // 有数据才让 CDN 缓存 5 分钟；空结果绝不缓存，避免“同步了岗位页面还是空”
          // 登录后才能看的数据绝不能放进共享缓存（CDN 会把它发给没登录的人）：只允许浏览器私有缓存
          "Cache-Control":
            visible.length === 0
              ? "no-store"
              : authConfig()
                ? "private, max-age=120"
                : "public, s-maxage=300, stale-while-revalidate=600",
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
