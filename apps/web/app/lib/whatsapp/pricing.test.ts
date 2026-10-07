import { describe, it, expect } from "vitest";
import {
  quoteWhatsAppMessage,
  quoteWhatsAppCampaign,
  WHATSAPP_IRAQ_REFERENCE,
  whatsappPricingSchema,
} from "./pricing";
const policy = { revision: 1, config: WHATSAPP_IRAQ_REFERENCE };
const at = new Date("2026-10-05T09:00:00Z");
const input = { phone: "07700000000", category: "MARKETING", at };

describe("Iraq WhatsApp pricing", () => {
  it("uses exact decimal cost, 30% markup and upward rounding", () => {
    expect(quoteWhatsAppMessage(policy, input)).toMatchObject({
      costIqd: "44.33",
      unitPriceIqd: 58,
      policyRevision: 1,
      estimated: true,
    });
    expect(
      quoteWhatsAppMessage(policy, { ...input, category: "UTILITY" }),
    ).toMatchObject({ costIqd: "10.27", unitPriceIqd: 14 });
  });
  it("prices international/Arabic-format Iraq phones identically", () => {
    for (const phone of [
      "+9647700000000",
      "009647700000000",
      "٠٧٧٠٠٠٠٠٠٠٠",
      "7700000000",
    ])
      expect(
        quoteWhatsAppMessage(policy, { ...input, phone }).unitPriceIqd,
      ).toBe(58);
  });
  it("refuses foreign, invalid, unknown and unsupported categories", () => {
    for (const phone of ["+971500000000", "9641", "abc"])
      expect(() => quoteWhatsAppMessage(policy, { ...input, phone })).toThrow();
    for (const category of ["SERVICE", "AUTHENTICATION", "CHEAP", ""])
      expect(() =>
        quoteWhatsAppMessage(policy, { ...input, category }),
      ).toThrow();
  });
  it("applies changed rates, provider fees, exchange and rounding without editing the function", () => {
    const updated = {
      revision: 2,
      config: {
        ...policy.config,
        marketingUsd: "0.05",
        providerFeeUsd: "0.005",
        usdToIqd: "1500",
        markupPercent: 20,
        roundToIqd: 5,
      },
    };
    expect(quoteWhatsAppMessage(updated, input)).toMatchObject({
      costIqd: "82.5",
      unitPriceIqd: 100,
      policyRevision: 2,
    });
    expect(quoteWhatsAppMessage(policy, input).unitPriceIqd).toBe(58);
  });
  it("keeps exact whole-IQD boundaries and sub-dinar positive rates", () => {
    const config = {
      ...policy.config,
      marketingUsd: "0.1",
      usdToIqd: "1000",
      markupPercent: 0,
    };
    expect(
      quoteWhatsAppMessage({ revision: 1, config }, input).unitPriceIqd,
    ).toBe(100);
    expect(
      quoteWhatsAppMessage(
        { revision: 1, config: { ...config, marketingUsd: "0.000001" } },
        input,
      ).unitPriceIqd,
    ).toBe(1);
  });
  it("requires real dates, positive costs and a reviewed numeric policy", () => {
    for (const update of [
      { marketingUsd: "-1" },
      { marketingUsd: "NaN" },
      { marketingUsd: "0" },
      { utilityUsd: "0.0000001" },
      { usdToIqd: "0" },
      { markupPercent: -1 },
      { markupPercent: 30.123 },
      { roundToIqd: 0 },
      { effectiveFrom: "2026-02-30" },
      { sourceUrl: "javascript:alert(1)" },
    ])
      expect(
        whatsappPricingSchema.safeParse({ ...policy.config, ...update })
          .success,
      ).toBe(false);
    expect(
      whatsappPricingSchema.safeParse({
        ...policy.config,
        markupPercent: 30.01,
      }).success,
    ).toBe(true);
    expect(() =>
      quoteWhatsAppMessage({ ...policy, revision: 0 }, input),
    ).toThrow();
  });
  it("honors Baghdad effective date and rejects unsafe totals", () => {
    expect(() =>
      quoteWhatsAppMessage(policy, {
        ...input,
        at: new Date("2026-09-30T20:59:59Z"),
      }),
    ).toThrow();
    expect(
      quoteWhatsAppMessage(policy, {
        ...input,
        at: new Date("2026-09-30T21:00:00Z"),
      }).unitPriceIqd,
    ).toBe(58);
    expect(() =>
      quoteWhatsAppMessage(
        {
          revision: 1,
          config: {
            ...policy.config,
            marketingUsd: "99999999",
            usdToIqd: "99999999",
            markupPercent: 500,
          },
        },
        input,
      ),
    ).toThrow();
  });
  it("totals already-rounded per-message quotes and handles zero recipients", () => {
    expect(
      quoteWhatsAppCampaign(policy, "MARKETING", [input.phone, input.phone]),
    ).toMatchObject({ totalIqd: 116, messageCount: 2, unitPriceIqd: 58 });
    expect(quoteWhatsAppCampaign(policy, "UTILITY", [])).toMatchObject({
      totalIqd: 0,
      messageCount: 0,
      unitPriceIqd: null,
    });
  });
});
