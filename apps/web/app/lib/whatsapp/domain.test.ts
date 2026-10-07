import { describe, it, expect, afterEach } from "vitest";
import {
  normalizePhone,
  templateParts,
  renderTemplate,
  seal,
  unseal,
  sameSecret,
  statusRank,
  advancesStatus,
} from "./domain";
import { getUserPermissions } from "../permissions";
afterEach(() => {
  delete process.env.WHATSAPP_ENCRYPTION_KEY;
});
describe("WhatsApp payload safety", () => {
  it("normalizes Iraqi local, international and Arabic digits without corrupting foreign numbers", () => {
    expect(normalizePhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("9647701234567");
    expect(normalizePhone("+964 770 123 4567")).toBe("9647701234567");
    expect(normalizePhone("+44 7700 900123")).toBe("447700900123");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("abc07701234567")).toBeNull();
  });
  it("turns allowed variables into ordered Meta parameters", () => {
    const body = "مرحبًا {{اسم_العميل}} من {{اسم_الصيدلية}}: {{نص_1}}";
    expect(templateParts(body).metaBody).toBe("مرحبًا {{1}} من {{2}}: {{3}}");
    expect(
      renderTemplate(body, "أحمد", "الشمس", {
        custom1: "نفتح الساعة 8",
        custom2: "",
      }),
    ).toEqual({
      text: "مرحبًا أحمد من الشمس: نفتح الساعة 8",
      parameters: ["أحمد", "الشمس", "نفتح الساعة 8"],
    });
    expect(() => templateParts("{{التشخيص}}")).toThrow();
    expect(() => templateParts("نص {{اسم_العميل}")).toThrow();
    expect(() =>
      renderTemplate("{{نص_1}}", "أ", "ب", { custom1: "", custom2: "" }),
    ).toThrow();
  });
  it("encrypts tenant credentials with authenticated encryption and fails closed without a key", () => {
    expect(() => seal("secret")).toThrow();
    process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const encrypted = seal("secret");
    expect(encrypted).not.toContain("secret");
    expect(unseal(encrypted)).toBe("secret");
    const b = Buffer.from(encrypted, "base64");
    b[b.length - 1] ^= 1;
    expect(() => unseal(b.toString("base64"))).toThrow();
  });
  it("keeps message status monotonic and treats authentication secrets as exact bytes", () => {
    expect(statusRank("READ")).toBeGreaterThan(statusRank("DELIVERED"));
    expect(statusRank("SENT")).toBeLessThan(statusRank("READ"));
    expect(sameSecret("Bearer abc", "Bearer abc")).toBe(true);
    expect(sameSecret("Bearer abc", "Bearer abcd")).toBe(false);
  });
  it("does not give a cashier the sending/template permissions unless explicitly granted", () => {
    expect(
      getUserPermissions({ role: "CASHIER" }).canSendWhatsAppCampaigns,
    ).toBe(false);
    expect(
      getUserPermissions({ role: "ADMIN" }).canManageWhatsAppTemplates,
    ).toBe(true);
    expect(
      getUserPermissions({
        role: "PHARMACIST",
        permissions: JSON.stringify({ canSendWhatsAppCampaigns: true }),
      }).canSendWhatsAppCampaigns,
    ).toBe(true);
    expect(
      getUserPermissions({
        role: "WAREHOUSE",
        permissions: JSON.stringify({ canSendWhatsAppCampaigns: true }),
      }).canSendWhatsAppCampaigns,
    ).toBe(false);
  });
  it("records failed delivery after acceptance and ignores late or impossible status callbacks", () => {
    expect(advancesStatus("SENT", "FAILED")).toBe(true);
    expect(advancesStatus("FAILED", "SENT")).toBe(false);
    expect(advancesStatus("DELIVERED", "FAILED")).toBe(false);
    expect(advancesStatus("READ", "SENT")).toBe(false);
    expect(advancesStatus("FAILED", "READ")).toBe(true);
    expect(advancesStatus("BLOCKED", "READ")).toBe(false);
    expect(advancesStatus("QUEUED", "READ")).toBe(false);
  });
});
