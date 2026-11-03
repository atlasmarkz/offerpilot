import { AuthError, errorCode, gotrue, need, toTokens, type Tokens } from "./supabaseAuth";

/** 密码规则：8~72 位（72 是 bcrypt 的上限），同时包含字母和数字。返回给用户看的问题；合格返回 undefined。 */
export function validatePassword(pw: unknown): string | undefined {
  if (typeof pw !== "string") return "请输入密码";
  if (pw.length < 8) return "密码至少 8 位";
  if (pw.length > 72) return "密码不要超过 72 位";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "密码要同时包含字母和数字";
  return undefined;
}

/** 邮箱验证码：注册确认、找回密码。位数由 Supabase 项目设置决定（Authentication → Emails 里的 OTP Length），这里不写死。 */
export type CodeKind = "signup" | "recovery";

const sendFailed = (msg: string) =>
  /smtp|mail/i.test(msg) ? new AuthError("验证码邮件发送失败，请稍后重试（站点的邮件服务可能还没配置好）", 502) : new AuthError("发送失败，请稍后重试", 502);

async function mapSendError(res: Response): Promise<never> {
  const { code, msg } = await errorCode(res);
  if (res.status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit")
    throw new AuthError("发送太频繁，请一分钟后再试", 429);
  if (code === "weak_password") throw new AuthError("密码太简单，请换一个更复杂的", 400);
  if (code === "email_address_invalid" || code === "validation_failed") throw new AuthError("邮箱地址不可用，请换一个", 400);
  throw sendFailed(msg);
}

/** 注册：创建账号并发验证码邮件。邮箱已注册时 Supabase 也返回成功（不泄露邮箱是否存在）。 */
export async function signUp(email: string, password: string): Promise<void> {
  const res = await gotrue(need(), "/signup", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!res.ok) await mapSendError(res);
}

/** 重发注册验证码。 */
export async function resendSignup(email: string): Promise<void> {
  const res = await gotrue(need(), "/resend", { method: "POST", body: JSON.stringify({ type: "signup", email }) });
  if (!res.ok) await mapSendError(res);
}

/** 找回密码：发验证码邮件。邮箱不存在也按成功处理，调用方不要据此提示“邮箱未注册”。 */
export async function recover(email: string): Promise<void> {
  const res = await gotrue(need(), "/recover", { method: "POST", body: JSON.stringify({ email }) });
  if (!res.ok) await mapSendError(res);
}

/** 用邮箱 + 验证码换会话（注册确认或找回密码）。 */
export async function verifyCode(kind: CodeKind, email: string, token: string): Promise<Tokens> {
  const res = await gotrue(need(), "/verify", { method: "POST", body: JSON.stringify({ type: kind, email, token }) });
  if (!res.ok) {
    if (res.status === 429) throw new AuthError("尝试太频繁，请稍后再试", 429);
    if (res.status >= 500) throw new AuthError("登录服务暂时不可用，请稍后重试", 502);
    throw new AuthError("验证码不对或已过期，请重新获取", 400);
  }
  return toTokens((await res.json()) as Record<string, unknown>);
}

/** 邮箱 + 密码登录。错误信息刻意不区分“邮箱不存在”和“密码错”，防止被用来探测账号。 */
export async function passwordLogin(email: string, password: string): Promise<Tokens> {
  const res = await gotrue(need(), "/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  if (res.ok) return toTokens((await res.json()) as Record<string, unknown>);
  const { code } = await errorCode(res);
  if (code === "email_not_confirmed") throw new AuthError("邮箱还没有验证，请先完成注册时的验证码验证", 403);
  if (res.status === 429) throw new AuthError("尝试太频繁，请稍后再试", 429);
  if (res.status >= 500) throw new AuthError("登录服务暂时不可用，请稍后重试", 502);
  throw new AuthError("邮箱或密码不对", 400);
}

/** 设置新密码（用刚通过验证码拿到的会话令牌）。 */
export async function setPassword(accessToken: string, password: string): Promise<void> {
  const res = await gotrue(need(), "/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return;
  const { code } = await errorCode(res);
  if (code === "weak_password") throw new AuthError("密码太简单，请换一个更复杂的", 400);
  if (code === "same_password") throw new AuthError("新密码不能和旧密码相同", 400);
  throw new AuthError("设置新密码失败，请稍后重试", 502);
}
