/** 附件简历：只收 PDF 和 Word(.docx)，不超过 5MB。校验文件头，不只信扩展名。 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export class AttachError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export interface CheckedFile {
  ext: keyof typeof TYPES;
  contentType: string;
  /** 去掉路径和控制字符后的展示用文件名 */
  name: string;
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

export function checkAttachment(fileName: string, bytes: Uint8Array): CheckedFile {
  if (bytes.length === 0) throw new AttachError("文件是空的");
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachError("文件超过 5MB", 413);
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext !== "pdf" && ext !== "docx") throw new AttachError("附件只支持 PDF 和 Word(.docx)");
  // PDF 以 %PDF- 开头；docx 是 zip，以 PK\x03\x04 开头
  const ok = ext === "pdf" ? startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) : startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (!ok) throw new AttachError("文件内容和扩展名对不上，请确认是正常的 PDF 或 Word 文件");
  const name = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .trim()
    .slice(0, 120);
  return { ext, contentType: TYPES[ext], name: name || `resume.${ext}` };
}

/** 下载时的 Content-Disposition：用 RFC 5987 编码，中文文件名也能正确保存。 */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
