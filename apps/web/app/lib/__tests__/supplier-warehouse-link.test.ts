import { describe, it, expect } from "vitest";
import {
  decideSupplierLink,
  isLinkConflict,
  type LinkCandidateSupplier,
} from "../supplier-warehouse-link";

const ORG = "org-1";
const WH = "wh-1";

function supplier(over: Partial<LinkCandidateSupplier> = {}): LinkCandidateSupplier {
  return {
    id: "sup-1",
    name: "التفاح الأخضر",
    organizationId: ORG,
    warehouseId: null,
    ...over,
  };
}

const call = (
  s: LinkCandidateSupplier,
  existing: { id: string; name: string } | null = null,
  organizationId = ORG
) =>
  decideSupplierLink({
    supplier: s,
    warehouseId: WH,
    organizationId,
    existingLinkForWarehouse: existing,
  });

describe("decideSupplierLink — الحالة السعيدة", () => {
  it("مورد غير مربوط في المؤسسة الصحيحة ولا ارتباط قائم → LINK", () => {
    expect(call(supplier()).action).toBe("LINK");
  });

  it("مورد مربوط مسبقاً بنفس المذخر → ALREADY_LINKED بلا رسالة خطأ (§174)", () => {
    const res = call(supplier({ warehouseId: WH }));
    expect(res.action).toBe("ALREADY_LINKED");
    expect(res.reason).toBeUndefined();
  });

  it("الارتباط القائم هو نفس المورد → ALREADY_LINKED لا تعارض", () => {
    const s = supplier({ warehouseId: WH });
    expect(call(s, { id: s.id, name: s.name }).action).toBe("ALREADY_LINKED");
  });
});

describe("decideSupplierLink — عزل المؤسسات (§172)", () => {
  it("مورد مؤسسة أخرى → WRONG_ORG", () => {
    const res = call(supplier({ organizationId: "org-2" }));
    expect(res.action).toBe("WRONG_ORG");
    expect(res.reason).toBeTruthy();
  });

  it("مورد بلا مؤسسة لا يُربط تلقائياً (§130)", () => {
    expect(call(supplier({ organizationId: null })).action).toBe("WRONG_ORG");
  });

  it("فحص المؤسسة يسبق فحص التعارض — لا يُفصح عن ارتباط مورد مؤسسة أخرى", () => {
    // مورد مؤسسة أخرى ومربوط بمذخر ثالث: الجواب يجب أن يكون WRONG_ORG،
    // لا CONFLICT، وإلا كشفت الرسالة حالة ربط لا تخص المؤسسة المختارة.
    const res = call(supplier({ organizationId: "org-2", warehouseId: "wh-9" }));
    expect(res.action).toBe("WRONG_ORG");
    expect(res.reason).not.toContain("مذخر آخر");
  });
});

describe("decideSupplierLink — التعارضات (§175: لا استبدال تلقائي)", () => {
  it("المورد مربوط بمذخر آخر → CONFLICT_SUPPLIER_LINKED_ELSEWHERE", () => {
    const res = call(supplier({ warehouseId: "wh-2" }));
    expect(res.action).toBe("CONFLICT_SUPPLIER_LINKED_ELSEWHERE");
    expect(res.reason).toContain("التفاح الأخضر");
  });

  it("للمؤسسة مورد آخر مربوط بهذا المذخر → CONFLICT_WAREHOUSE_HAS_SUPPLIER", () => {
    const res = call(supplier(), { id: "sup-2", name: "شبر" });
    expect(res.action).toBe("CONFLICT_WAREHOUSE_HAS_SUPPLIER");
    expect(res.reason).toContain("شبر");
  });

  it("الحالتان تُصنَّفان تعارضاً (409) وما عداهما لا", () => {
    expect(isLinkConflict("CONFLICT_SUPPLIER_LINKED_ELSEWHERE")).toBe(true);
    expect(isLinkConflict("CONFLICT_WAREHOUSE_HAS_SUPPLIER")).toBe(true);
    expect(isLinkConflict("LINK")).toBe(false);
    expect(isLinkConflict("ALREADY_LINKED")).toBe(false);
    expect(isLinkConflict("WRONG_ORG")).toBe(false);
  });

  it("لا يُقترح استبدال في أي رسالة تعارض", () => {
    const a = call(supplier({ warehouseId: "wh-2" })).reason ?? "";
    const b = call(supplier(), { id: "sup-2", name: "شبر" }).reason ?? "";
    // الخطة تمنع فك الربط وإعادة توجيهه في النسخة الأولى (§176)، فالرسالة
    // لا تَعِد بزر استبدال غير موجود.
    for (const msg of [a, b]) expect(msg).not.toMatch(/استبدل الآن|اضغط للاستبدال/);
  });
});

describe("decideSupplierLink — لا يُنتج أثراً جانبياً", () => {
  it("لا يعدّل كائن المورد الممرَّر", () => {
    const s = supplier();
    const snapshot = JSON.stringify(s);
    call(s, { id: "sup-2", name: "شبر" });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
