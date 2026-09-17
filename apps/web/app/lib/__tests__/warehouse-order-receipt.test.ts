import { describe, it, expect } from "vitest";
import { linkedPurchaseId, receiptState } from "../warehouse-order-receipt";

const approvedEvent = { type: "APPROVED", payload: { purchaseId: "p1" } };

describe("linkedPurchaseId", () => {
  it("يقرأ الفاتورة من حدث APPROVED لطلب معتمد أو مشحون أو مُسلَّم", () => {
    for (const status of ["APPROVED", "SHIPPED", "DELIVERED"]) {
      expect(linkedPurchaseId({ status, events: [{ type: "SENT", payload: null }, approvedEvent] })).toBe("p1");
    }
  });

  it("لا فاتورة لطلب غير معتمد أو ملغى أو بلا payload صالح", () => {
    expect(linkedPurchaseId({ status: "QUOTED", events: [approvedEvent] })).toBeNull();
    expect(linkedPurchaseId({ status: "CANCELLED", events: [approvedEvent] })).toBeNull();
    expect(linkedPurchaseId({ status: "APPROVED", events: [{ type: "APPROVED", payload: { purchaseId: 5 } }] })).toBeNull();
    expect(linkedPurchaseId({ status: "APPROVED", events: [] })).toBeNull();
  });
});

describe("receiptState", () => {
  it("الاعتماد وحده = بانتظار الاستلام (الأدوية ليست في الدفعات بعد)", () => {
    expect(receiptState("APPROVED", "p1", "PENDING")).toBe("AWAITING_RECEIPT");
    expect(receiptState("DELIVERED", "p1", "PENDING")).toBe("AWAITING_RECEIPT");
  });

  it("فاتورة مكتملة = استُلمت", () => {
    expect(receiptState("SHIPPED", "p1", "COMPLETED")).toBe("RECEIVED");
  });

  it("فاتورة ملغاة أو مفقودة", () => {
    expect(receiptState("APPROVED", "p1", "CANCELLED")).toBe("PURCHASE_CANCELLED");
    expect(receiptState("APPROVED", "p1", null)).toBe("PURCHASE_MISSING");
  });

  it("طلب غير قابل للاستلام", () => {
    expect(receiptState("QUOTED", null, null)).toBe("NOT_APPLICABLE");
    expect(receiptState("APPROVED", null, null)).toBe("NOT_APPLICABLE");
  });
});
