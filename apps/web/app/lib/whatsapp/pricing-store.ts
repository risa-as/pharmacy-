import type { Db } from "./store";
import { WaError } from "./domain";
import { whatsappPricingSchema, type WhatsAppPricingPolicy } from "./pricing";

export const WA_PRICING_LOCK = "wa-platform-pricing";
export async function readWhatsAppPricing(
  db: Db,
): Promise<WhatsAppPricingPolicy | null> {
  const rows = await db.$queryRaw<
    { revision: number; config: unknown }[]
  >`SELECT revision,config FROM "public"."WaPricingPolicy" WHERE id='singleton'`;
  if (!rows[0]) return null;
  const config = whatsappPricingSchema.safeParse(rows[0].config);
  if (!config.success)
    throw new WaError("إعدادات التسعير غير صالحة؛ راجع مدير المنصة.", 503);
  return { revision: rows[0].revision, config: config.data };
}
