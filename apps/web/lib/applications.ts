import { ApplyRecord, ApplyStatus, type Channel } from "@offerpilot/shared";
import { z } from "zod";

/** 一次最多上传多少条（扩展本机记录会分批上传）。 */
export const UPLOAD_BATCH = 500;

export const ApplicationUpload = z.object({ items: z.array(ApplyRecord).min(1).max(UPLOAD_BATCH) });
export const ApplicationPatch = z.object({ status: ApplyStatus });

export interface Application {
  id: string;
  channel: Channel;
  external_id: string;
  company: string;
  title: string;
  city: string;
  salary: string;
  url: string;
  status: ApplyStatus;
  applied_at: string;
  updated_at: string;
}

export const APPLICATION_COLUMNS = "id,channel,external_id,company,title,city,salary,url,status,applied_at,updated_at";
