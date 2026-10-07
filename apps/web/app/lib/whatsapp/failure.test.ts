import { describe, expect, it } from "vitest";
import { classifyWhatsAppFailure } from "./failure";

describe("WhatsApp database failure classification", () => {
  it("identifies missing raw-SQL tables or columns and Prisma schema failures", () => {
    for (const e of [
      { code: "P2010", meta: { code: "42P01" } },
      { code: "P2010", meta: { code: "42703" } },
      { code: "P2021" },
      { code: "P2022" },
    ]) {
      expect(classifyWhatsAppFailure(e).code).toBe("WHATSAPP_SCHEMA_NOT_READY");
    }
  });
  it("does not label a connection outage as an unapplied migration", () => {
    expect(classifyWhatsAppFailure({ code: "P1001" }).code).toBe(
      "WHATSAPP_DATABASE_UNAVAILABLE",
    );
    expect(
      classifyWhatsAppFailure({ code: "P2010", meta: { code: "23505" } }).code,
    ).toBe("WHATSAPP_REQUEST_FAILED");
  });
  it("never includes the error message or arbitrary diagnostic values", () => {
    const secret = "private-connection-or-patient-value";
    const classified = classifyWhatsAppFailure({
      code: secret,
      message: secret,
      meta: { code: secret, message: secret },
    });
    expect(JSON.stringify(classified)).not.toContain(secret);
    expect(classified.prismaCode).toBeNull();
    expect(classified.sqlState).toBeNull();
  });
});
