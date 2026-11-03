import { z } from "zod";

export const BOARD_STATUSES = ["todo", "applied", "written_test", "interview", "offer", "rejected"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_LABEL: Record<BoardStatus, string> = {
  todo: "待投递",
  applied: "已投递",
  written_test: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "未通过",
};

const httpUrl = z
  .string()
  .max(500)
  .refine((u) => u === "" || /^https?:\/\//i.test(u), "链接要以 http:// 或 https:// 开头");

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const BoardCreate = z.object({
  job_id: z.string().max(64).nullable().optional(),
  company: z.string().trim().max(80).default(""),
  title: z.string().trim().min(1, "请填写岗位名称").max(200),
  url: httpUrl.default(""),
  status: z.enum(BOARD_STATUSES).default("todo"),
  note: z.string().max(2000).default(""),
  applied_at: date.optional(),
});
export type BoardCreate = z.infer<typeof BoardCreate>;

/** 修改：只允许改这些字段，且都可选。 */
export const BoardPatch = z
  .object({
    company: z.string().trim().max(80),
    title: z.string().trim().min(1).max(200),
    url: httpUrl,
    status: z.enum(BOARD_STATUSES),
    note: z.string().max(2000),
    applied_at: date,
  })
  .partial();
export type BoardPatch = z.infer<typeof BoardPatch>;

export interface BoardItem {
  id: string;
  job_id: string | null;
  company: string;
  title: string;
  url: string;
  status: BoardStatus;
  note: string;
  applied_at: string | null;
  updated_at: string;
}

export const BOARD_COLUMNS = "id,job_id,company,title,url,status,note,applied_at,updated_at";
