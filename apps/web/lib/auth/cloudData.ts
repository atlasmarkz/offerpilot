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

/** 剔除不该上云的字段（即使前端误传也挡在服务端）。 */
export function stripSecrets(profile: Record<string, unknown>): Record<string, unknown> {
  const { llm: _llm, apiKey: _k, llmApiKey: _lk, ...rest } = profile as Record<string, unknown>;
  return rest;
}
