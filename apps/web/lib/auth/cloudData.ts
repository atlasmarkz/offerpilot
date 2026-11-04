import { z } from "zod";

/** 云端只保存画像和已选岗位。简历文件、大模型密钥永远不进这里。 */
export const CloudDataIn = z.object({
  // 画像表单的内容，限制大小，防止被当成免费网盘
  profile: z
    .record(z.unknown())
    .refine((p) => JSON.stringify(p).length <= 100_000, "画像内容过大"),
  selected: z.array(z.string().max(64)).max(1000),
});
export type CloudDataIn = z.infer<typeof CloudDataIn>;

/** 永远不上云的字段：密钥，以及姓名这类身份信息（只存在用户本机，见 packages/shared 的 PRIVATE_FIELDS）。 */
const NEVER_UPLOAD = ["llm", "apiKey", "llmApiKey", "name", "phone", "email", "idNumber", "birthDate", "address"];

/** 剔除不该上云的字段（即使前端误传也挡在服务端）。 */
export function stripSecrets(profile: Record<string, unknown>): Record<string, unknown> {
  const out = { ...profile };
  for (const k of NEVER_UPLOAD) delete out[k];
  return out;
}
