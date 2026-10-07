import { z } from "zod";
import { normalizePhone, WaError } from "./shared";

const decimal = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})(\.\d{1,6})?$/,
    "اكتب مبلغًا موجبًا بحد أقصى 6 منازل عشرية.",
  );
const positiveDecimal = decimal.refine(
  (v) => Number(v) > 0,
  "يجب أن تكون القيمة أكبر من صفر.",
);
export const whatsappPricingSchema = z
  .object({
    marketingUsd: positiveDecimal,
    utilityUsd: positiveDecimal,
    providerFeeUsd: decimal,
    usdToIqd: positiveDecimal,
    markupPercent: z
      .number()
      .finite()
      .min(0)
      .max(500)
      .refine(
        (v) => Number(v.toFixed(2)) === v,
        "النسبة بحد أقصى منزلتين عشريتين.",
      ),
    roundToIqd: z.number().int().min(1).max(1000),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + "T00:00:00Z");
        return (
          Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
        );
      }, "التاريخ غير صالح."),
    sourceUrl: z
      .string()
      .url()
      .max(1000)
      .refine(
        (v) => new URL(v).protocol === "https:",
        "الرابط يجب أن يبدأ بـ https.",
      ),
  })
  .strict();
export type WhatsAppPricingConfig = z.infer<typeof whatsappPricingSchema>;
export type WhatsAppPricingPolicy = {
  revision: number;
  config: WhatsAppPricingConfig;
};

/** Reference values only: the platform owner must confirm/save their actual costs. */
export const WHATSAPP_IRAQ_REFERENCE: WhatsAppPricingConfig = {
  marketingUsd: "0.0341",
  utilityUsd: "0.0079",
  providerFeeUsd: "0",
  usdToIqd: "1300",
  markupPercent: 30,
  roundToIqd: 1,
  effectiveFrom: "2026-10-01",
  sourceUrl:
    "https://www.alibabacloud.com/help/en/chatapp/whatsapp-message-rate-adjustments-and-service-conversation-message-billing",
};

const SCALE = BigInt(1000000);
function micros(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}
function exactDecimal(numerator: bigint, denominator: bigint) {
  const whole = numerator / denominator;
  const fraction = (numerator % denominator)
    .toString()
    .padStart(denominator.toString().length - 1, "0")
    .replace(/0+$/, "");
  return whole.toString() + (fraction ? "." + fraction : "");
}

/** A quote, never a debit. Category must come from the approved server-side template. */
export function quoteWhatsAppMessage(
  policy: WhatsAppPricingPolicy,
  input: { phone: string; category: string; at?: Date },
) {
  const c = whatsappPricingSchema.parse(policy.config);
  if (!Number.isSafeInteger(policy.revision) || policy.revision < 1)
    throw new WaError("نسخة التسعير غير صالحة.", 503);
  const phone = normalizePhone(input.phone);
  if (!phone || !/^964\d{10}$/.test(phone))
    throw new WaError("التسعير الحالي يدعم أرقام العراق (+964) فقط.");
  if (input.category !== "MARKETING" && input.category !== "UTILITY")
    throw new WaError("نوع الرسالة غير مدعوم في التسعير الحالي.");
  const at = input.at ?? new Date();
  if (
    !Number.isFinite(at.getTime()) ||
    at.getTime() < new Date(c.effectiveFrom + "T00:00:00+03:00").getTime()
  )
    throw new WaError("هذه الأسعار لم يبدأ سريانها بعد.", 409);
  const rate = input.category === "MARKETING" ? c.marketingUsd : c.utilityUsd;
  const costUsd = micros(rate) + micros(c.providerFeeUsd);
  const costNumerator = costUsd * micros(c.usdToIqd);
  const denominator = SCALE * SCALE * BigInt(10000);
  const priceNumerator =
    costNumerator * BigInt(10000 + Math.round(c.markupPercent * 100));
  const increment = BigInt(c.roundToIqd);
  const price =
    ((priceNumerator + denominator * increment - BigInt(1)) /
      (denominator * increment)) *
    increment;
  if (price > BigInt(Number.MAX_SAFE_INTEGER))
    throw new WaError("المبلغ يتجاوز الحد المدعوم.");
  return {
    currency: "IQD" as const,
    market: "IQ" as const,
    category: input.category,
    policyRevision: policy.revision,
    metaRateUsd: rate,
    providerFeeUsd: c.providerFeeUsd,
    usdToIqd: c.usdToIqd,
    costIqd: exactDecimal(costNumerator, SCALE * SCALE),
    markupPercent: c.markupPercent,
    unitPriceIqd: Number(price),
    estimated: true as const,
  };
}

export function quoteWhatsAppCampaign(
  policy: WhatsAppPricingPolicy,
  category: string,
  phones: string[],
) {
  if (category !== "MARKETING" && category !== "UTILITY")
    throw new WaError("نوع الرسالة غير مدعوم في التسعير الحالي.");
  const messages = phones.map((phone) =>
    quoteWhatsAppMessage(policy, { phone, category }),
  );
  const total = messages.reduce(
    (sum, m) => sum + BigInt(m.unitPriceIqd),
    BigInt(0),
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new WaError("إجمالي الإرسال يتجاوز الحد المدعوم.");
  return {
    currency: "IQD" as const,
    policyRevision: policy.revision,
    messageCount: phones.length,
    unitPriceIqd: messages[0]?.unitPriceIqd ?? null,
    totalIqd: Number(total),
    markupPercent: policy.config.markupPercent,
    estimated: true as const,
  };
}
