import { BOARD_COLUMNS, BoardCreate, type BoardItem } from "../../../../lib/board";
import { jsonWith, resolveSession, sameOrigin } from "../../../../lib/auth/session";
import { AuthError, authConfig, userRest } from "../../../../lib/auth/supabaseAuth";

export const dynamic = "force-dynamic";

/** 我的投递看板。 */
export async function GET(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/board_item?select=${BOARD_COLUMNS}&order=updated_at.desc&limit=1000`, s.accessToken);
    if (!res.ok) return jsonWith({ error: "读取看板失败" }, { status: 502, cookies: s.setCookies });
    return jsonWith({ items: (await res.json()) as BoardItem[] }, { cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "读取失败" }, { status: 502 });
  }
}

/** 添加一条投递记录；数量受会员等级限制（数据库触发器兜底）。 */
export async function POST(req: Request) {
  if (!authConfig()) return jsonWith({ error: "账号功能未启用" }, { status: 503 });
  if (!sameOrigin(req)) return jsonWith({ error: "请求来源不合法" }, { status: 403 });
  const parsed = BoardCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonWith({ error: parsed.error.issues[0]?.message ?? "数据格式不对" }, { status: 400 });
  try {
    const s = await resolveSession(req);
    if (!s) return jsonWith({ error: "请先登录" }, { status: 401 });
    const res = await userRest(`/board_item?select=${BOARD_COLUMNS}`, s.accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...parsed.data, user_id: s.user.id }),
    });
    if (!res.ok) {
      const limit = (await res.text().catch(() => "")).includes("board_limit");
      return jsonWith(
        { error: limit ? "看板条数已达当前等级的上限，请删除一些或升级会员" : "添加失败", code: limit ? "limit" : undefined },
        { status: limit ? 403 : 502, cookies: s.setCookies },
      );
    }
    const [item] = (await res.json()) as BoardItem[];
    return jsonWith({ item }, { status: 201, cookies: s.setCookies });
  } catch (e) {
    return jsonWith({ error: e instanceof AuthError ? e.message : "添加失败" }, { status: 502 });
  }
}
