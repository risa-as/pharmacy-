import { describe, it, expect } from "vitest";
import {
  canDecideLinkRequest,
  canRequestSupplierLink,
  decideCreateLinkRequest,
  sanitizeNote,
  type CreateLinkRequestInput,
} from "../supplier-link-request";

function input(over: Partial<CreateLinkRequestInput> = {}): CreateLinkRequestInput {
  return {
    organizationId: "org-1",
    supplier: { id: "s1", name: "اكليل الجبل", organizationId: "org-1", warehouseId: null },
    warehouse: { id: "wh-1", name: "نسيم البحر", isActive: true },
    existingLinkForWarehouse: null,
    pendingForSupplier: null,
    pendingForWarehouse: null,
    ...over,
  };
}

describe("canRequestSupplierLink", () => {
  it("مدير المؤسسة فقط", () => {
    expect(canRequestSupplierLink("ADMIN")).toBe(true);
    expect(canRequestSupplierLink("MANAGER")).toBe(true);
    expect(canRequestSupplierLink("PHARMACIST")).toBe(false);
    expect(canRequestSupplierLink("CASHIER")).toBe(false);
    expect(canRequestSupplierLink("WAREHOUSE")).toBe(false);
  });
});

describe("decideCreateLinkRequest", () => {
  it("طلب صالح", () => {
    expect(decideCreateLinkRequest(input())).toEqual({ ok: true });
  });

  it("مورد مؤسسة أخرى يُعامل كغير موجود", () => {
    const res = decideCreateLinkRequest(input({ supplier: { id: "s1", name: "x", organizationId: "org-2", warehouseId: null } }));
    expect(res).toMatchObject({ ok: false, status: 404, code: "SUPPLIER_NOT_FOUND" });
  });

  it("مذخر معطّل مرفوض", () => {
    const res = decideCreateLinkRequest(input({ warehouse: { id: "wh-1", name: "x", isActive: false } }));
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it("مربوط بنفس المذخر أصلاً", () => {
    const res = decideCreateLinkRequest(input({ supplier: { id: "s1", name: "x", organizationId: "org-1", warehouseId: "wh-1" } }));
    expect(res).toMatchObject({ ok: false, code: "ALREADY_LINKED" });
  });

  it("مربوط بمذخر آخر", () => {
    const res = decideCreateLinkRequest(input({ supplier: { id: "s1", name: "x", organizationId: "org-1", warehouseId: "wh-9" } }));
    expect(res).toMatchObject({ ok: false, status: 409, code: "CONFLICT_SUPPLIER_LINKED_ELSEWHERE" });
  });

  it("للمذخر مورد آخر مربوط في نفس المؤسسة (مورد مرآة مثلاً)", () => {
    const res = decideCreateLinkRequest(input({ existingLinkForWarehouse: { id: "mirror", name: "مذخر على المنصة: نسيم البحر" } }));
    expect(res).toMatchObject({ ok: false, status: 409, code: "CONFLICT_WAREHOUSE_HAS_SUPPLIER" });
  });

  it("طلب معلّق لنفس المورد يمنع طلباً ثانياً", () => {
    const res = decideCreateLinkRequest(input({ pendingForSupplier: { warehouseName: "نسيم البحر" } }));
    expect(res).toMatchObject({ ok: false, code: "PENDING_EXISTS" });
  });

  it("طلب معلّق لنفس المذخر من مورد آخر", () => {
    const res = decideCreateLinkRequest(input({ pendingForWarehouse: { supplierName: "الليل الازلي" } }));
    expect(res).toMatchObject({ ok: false, code: "WAREHOUSE_PENDING_EXISTS" });
  });
});

describe("canDecideLinkRequest / sanitizeNote", () => {
  it("المعلّق فقط يُحسم", () => {
    expect(canDecideLinkRequest("PENDING")).toBe(true);
    expect(canDecideLinkRequest("APPROVED")).toBe(false);
    expect(canDecideLinkRequest("CANCELLED")).toBe(false);
  });

  it("الملاحظة تُقصّ وتُفرَّغ", () => {
    expect(sanitizeNote("   ")).toBeNull();
    expect(sanitizeNote(5)).toBeNull();
    expect(sanitizeNote("x".repeat(900))?.length).toBe(500);
  });
});
