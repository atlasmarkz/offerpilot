import mammoth from "mammoth";
import { definePDFJSModule, extractText, getDocumentProxy } from "unpdf";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 从简历文件里取出纯文字；支持 pdf / docx / txt / md。扫描件（图片 PDF）取不到文字。 */
export async function fileToText(name: string, bytes: Uint8Array): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") {
    // 用 PDF.js 4 的 legacy 构建：新版依赖 Node 22 才有的 Iterator，Node 20 跑不了
    definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  }
  if (ext === "txt" || ext === "md") return new TextDecoder("utf-8").decode(bytes);
  throw new Error("只支持 PDF、Word(.docx)、txt、md 文件");
}
