import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { WaError } from "./shared";
export { WaError, normalizePhone } from "./shared";

export const selectionSchema = z.object({
  mode: z.enum(["ids", "filtered"]),
  ids: z.array(z.string().uuid()).max(1000).default([]),
  excludedIds: z.array(z.string().uuid()).max(1000).default([]),
  search: z.string().max(120).default(""),
  branchId: z.string().uuid().optional(),
});
export const previewSchema = z.object({
  templateId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  selection: selectionSchema,
  values: z
    .object({
      custom1: z.string().max(300).default(""),
      custom2: z.string().max(300).default(""),
    })
    .default({}),
});
export const templateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  language: z.enum(["ar", "en"]).default("ar"),
  category: z.enum(["UTILITY", "MARKETING"]),
  body: z.string().trim().min(10).max(1024),
});
export const variableNames = [
  "اسم_العميل",
  "اسم_الصيدلية",
  "نص_1",
  "نص_2",
] as const;
export function templateParts(body: string) {
  const names = Array.from(body.matchAll(/\{\{([^{}]+)\}\}/g)).map((m) =>
    m[1].trim(),
  );
  if (
    names.some(
      (n) => !variableNames.includes(n as (typeof variableNames)[number]),
    )
  )
    throw new WaError("متغير غير مدعوم في القالب.");
  let i = 0;
  const metaBody = body.replace(/\{\{([^{}]+)\}\}/g, () => `{{${++i}}}`);
  if (/[{}]/.test(metaBody.replace(/\{\{\d+\}\}/g, "")))
    throw new WaError("صيغة متغيرات القالب غير صحيحة.");
  return { names, metaBody };
}
export function renderTemplate(
  body: string,
  name: string,
  pharmacy: string,
  values: { custom1: string; custom2: string },
) {
  const dict: Record<string, string> = {
    اسم_العميل: name,
    اسم_الصيدلية: pharmacy,
    نص_1: values.custom1,
    نص_2: values.custom2,
  };
  const { names } = templateParts(body);
  const parameters = names.map((n) => dict[n]?.trim() ?? "");
  if (parameters.some((v) => !v || /[\r\n\t]/.test(v)))
    throw new WaError("أكمل متغيرات الرسالة؛ القيم لا تتضمن أسطرًا جديدة.");
  let i = 0;
  return {
    text: body.replace(/\{\{([^{}]+)\}\}/g, () => parameters[i++]),
    parameters,
  };
}
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function key() {
  const k = Buffer.from(process.env.WHATSAPP_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32)
    throw new WaError("مفتاح تشفير WhatsApp غير مهيأ على الخادم.", 503);
  return k;
}
export function seal(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function unseal(value: string) {
  const b = Buffer.from(value, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function statusRank(status: string) {
  return (
    (
      {
        QUEUED: 0,
        SENDING: 1,
        UNKNOWN: 1,
        SENT: 2,
        FAILED: 2,
        DELIVERED: 3,
        READ: 4,
        CANCELLED: 5,
      } as Record<string, number>
    )[status] ?? -1
  );
}
export function advancesStatus(current: string, incoming: string) {
  if (["CANCELLED", "BLOCKED", "QUEUED"].includes(current)) return false;
  // Acceptance is not delivery: Meta can report delivery failure after SENT.
  // Late acceptance cannot erase a failure or a delivery/read confirmation.
  if (incoming === "FAILED")
    return ["SENDING", "UNKNOWN", "SENT"].includes(current);
  if (current === "FAILED" && incoming === "SENT") return false;
  return statusRank(incoming) > statusRank(current);
}
