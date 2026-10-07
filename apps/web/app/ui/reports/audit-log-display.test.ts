import { expect, it } from "vitest";
import {
  auditDetails,
  auditSource,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
} from "./audit-log-display";
it("renders amounts and actual old/new changes", () => {
  expect(
    auditDetails(
      JSON.stringify({
        total: 1000,
        discount: 100,
        changes: { price: { old: 200, new: 150 } },
        note: "Checked",
      }),
    ),
  ).toEqual([
    { label: "الإجمالي", value: "1,000" },
    { label: "الخصم", value: "100" },
    { label: "التغييرات", value: "السعر: قبل التعديل: 200 · بعد التعديل: 150" },
    { label: "الملاحظة", value: "Checked" },
  ]);
});
it("hides credentials and internal receipts", () => {
  const f = auditDetails(
    JSON.stringify({
      password: "hidden",
      token: "hidden",
      hash: "hidden",
      result: { patientPhone: "hidden" },
      changes: { password: "hidden", price: 50 },
    }),
  );
  expect(JSON.stringify(f)).not.toContain("hidden");
  expect(f).toEqual([{ label: "التغييرات", value: "السعر: 50" }]);
});
it("supports legacy text and no details", () => {
  expect(auditDetails("Legacy text")[0].value).toBe("Legacy text");
  expect(auditDetails(null)).toEqual([]);
});
it("client nested source cannot pose as desktop source", () => {
  expect(auditSource('{"source":"desktop-sync"}').kind).toBe("desktop");
  expect(
    auditSource(
      '{"source":"client-report","reportedDetails":{"source":"desktop-sync"}}',
    ).kind,
  ).toBe("client");
  expect(auditSource(null).kind).toBe("unknown");
});
it("labels writeoff, backup and internal mobile receipts", () => {
  expect(AUDIT_ACTIONS.WRITE_OFF.label).toBe("شطب مخزون");
  expect(AUDIT_ENTITIES.BACKUP).toBe("نسخة احتياطية");
  expect(AUDIT_ENTITIES.MOBILE_OPERATION).toBe("عملية جوال");
});
