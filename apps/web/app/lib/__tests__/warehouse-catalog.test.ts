import { describe, it, expect, vi } from "vitest";
import {
  resolveToGlobalDrug,
  resolveCatalogDrug,
  barcodeChangeDecision,
  GLOBAL_DRUG_SCOPE,
  type CatalogPrisma,
} from "../warehouse-catalog";
import type { GlobalDrug } from "@prisma/client";

function fakeDrug(over: Partial<GlobalDrug> = {}): GlobalDrug {
  return {
    id: "drug-global-1",
    barcode: "5012345678900",
    tradeName: "بانادول اكسترا",
    scientificName: "Paracetamol",
    origin: null,
    image: null,
    isActive: true,
    isQuickSale: false,
    alternatives: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    organizationId: null,
    warehouseId: null,
    ...over,
  } as GlobalDrug;
}

/**
 * prisma وهمي يحاكي النطاق الثنائي: الصف العالمي (لا مؤسسة ولا مذخر)، وصف المذخر
 * الخاص. صفوف المؤسسات لا تُعاد أبداً من أي من المسارين — وهو جوهر ما تحرسه هذه
 * الاختبارات: مطابقة على صف مؤسسة كانت ستُنتج «غير متوفر» لصنف متوفر فعلاً.
 */
function makeFakePrisma(opts: {
  globalRow?: GlobalDrug | null;
  privateRow?: GlobalDrug | null;
  warehouseRow?: GlobalDrug | null;
  warehouseId?: string;
}): CatalogPrisma {
  return {
    globalDrug: {
      findFirst: vi.fn(async (args: any) => {
        const w = args.where;
        // مسار «عالمي»: يجب أن ينشر النطاق الكامل — مؤسسة null ومذخر null.
        if (w.organizationId === null) {
          if (w.warehouseId !== null) {
            throw new Error("global query must also pin warehouseId: null");
          }
          if (opts.globalRow && opts.globalRow.barcode === w.barcode) return opts.globalRow;
          return null;
        }
        // مسار «صف هذا المذخر»
        if (typeof w.warehouseId === "string") {
          if (
            opts.warehouseRow &&
            opts.warehouseRow.barcode === w.barcode &&
            opts.warehouseRow.warehouseId === w.warehouseId
          ) {
            return opts.warehouseRow;
          }
          return null;
        }
        throw new Error("unscoped GlobalDrug query");
      }),
    },
  };
}

describe("resolveToGlobalDrug — المطابقة عبر المستأجرين", () => {
  it("باركود صف عالمي → ينجح ويعيد الدواء", async () => {
    const drug = fakeDrug();
    const prisma = makeFakePrisma({ globalRow: drug });
    const res = await resolveToGlobalDrug(prisma, "5012345678900");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.drug.id).toBe("drug-global-1");
  });

  it("باركود موجود فقط كصف منظمة خاصة (لا صف عالمي) → NOT_FOUND (حصار الفشل الصامت)", async () => {
    const prisma = makeFakePrisma({});
    const res = await resolveToGlobalDrug(prisma, "5555");
    expect(res).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("باركود فارغ أو مسافات → EMPTY_BARCODE", async () => {
    const prisma = makeFakePrisma({});
    expect((await resolveToGlobalDrug(prisma, "")).reason).toBe("EMPTY_BARCODE");
    expect((await resolveToGlobalDrug(prisma, "   ")).reason).toBe("EMPTY_BARCODE");
    expect((await resolveToGlobalDrug(prisma, null)).reason).toBe("EMPTY_BARCODE");
    expect((await resolveToGlobalDrug(prisma, undefined)).reason).toBe("EMPTY_BARCODE");
  });

  it("يقصّ المسافات الطرفية قبل المطابقة", async () => {
    const drug = fakeDrug({ barcode: "5012345678900" });
    const prisma = makeFakePrisma({ globalRow: drug });
    const res = await resolveToGlobalDrug(prisma, " 5012345678900 ");
    expect(res.ok).toBe(true);
  });
});

describe("barcodeChangeDecision — منع تعديل باركود دواء مدرج في كتالوج", () => {
  it("لا تغيير فعلي → مسموح دائماً حتى لو كان مدرجاً في كتالوجات", () => {
    expect(barcodeChangeDecision({ catalogItemCount: 3, changed: false }).allowed).toBe(true);
  });

  it("تغيير مع صفوف كتالوج → ممنوع بسبب عربي واضح", () => {
    const d = barcodeChangeDecision({ catalogItemCount: 1, changed: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("كتالوج مذخر");
  });

  it("تغيير بلا صفوف كتالوج → مسموح", () => {
    expect(barcodeChangeDecision({ catalogItemCount: 0, changed: true }).allowed).toBe(true);
  });
});

describe("GLOBAL_DRUG_SCOPE — تعريف واحد لـ«عالمي»", () => {
  it("يثبّت الحقلين معاً: مؤسسة null ومذخر null", () => {
    expect(GLOBAL_DRUG_SCOPE).toEqual({ organizationId: null, warehouseId: null });
  });

  it("resolveToGlobalDrug ينشر النطاق كاملاً (الوهمي يرفض غير ذلك)", async () => {
    const drug = fakeDrug();
    const prisma = makeFakePrisma({ globalRow: drug });
    const res = await resolveToGlobalDrug(prisma, "5012345678900");
    expect(res.ok).toBe(true);
    expect((prisma.globalDrug.findFirst as any).mock.calls[0][0].where).toMatchObject({
      organizationId: null,
      warehouseId: null,
    });
  });
});

describe("resolveCatalogDrug — نطاق المذخر", () => {
  it("الصف العالمي يفوز دائماً ولو كان للمذخر صف بنفس الباركود", async () => {
    const globalRow = fakeDrug();
    const warehouseRow = fakeDrug({ id: "drug-wh-1", warehouseId: "wh-1" });
    const prisma = makeFakePrisma({ globalRow, warehouseRow, warehouseId: "wh-1" });
    const res = await resolveCatalogDrug(prisma, "wh-1", "5012345678900");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.scope).toBe("GLOBAL");
      expect(res.drug.id).toBe("drug-global-1");
    }
  });

  it("لا صف عالمي وللمذخر صفه الخاص → يُعاد بنطاق WAREHOUSE", async () => {
    const warehouseRow = fakeDrug({ id: "drug-wh-1", warehouseId: "wh-1" });
    const prisma = makeFakePrisma({ warehouseRow });
    const res = await resolveCatalogDrug(prisma, "wh-1", "5012345678900");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.scope).toBe("WAREHOUSE");
      expect(res.drug.id).toBe("drug-wh-1");
    }
  });

  it("صف مذخر آخر بنفس الباركود لا يُطابَق (عزل المستأجرين)", async () => {
    const warehouseRow = fakeDrug({ id: "drug-wh-2", warehouseId: "wh-2" });
    const prisma = makeFakePrisma({ warehouseRow });
    const res = await resolveCatalogDrug(prisma, "wh-1", "5012345678900");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NEEDS_NAME");
  });

  it("باركود غير مسجل إطلاقاً → NEEDS_NAME (لا NOT_FOUND: طلب حقل لا رفض)", async () => {
    const prisma = makeFakePrisma({});
    const res = await resolveCatalogDrug(prisma, "wh-1", "9999999999999");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("NEEDS_NAME");
  });

  it("باركود فارغ يبقى مرفوضاً — الباركود مفتاح المطابقة", async () => {
    const prisma = makeFakePrisma({ globalRow: fakeDrug() });
    const res = await resolveCatalogDrug(prisma, "wh-1", "   ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("EMPTY_BARCODE");
    expect(prisma.globalDrug.findFirst).not.toHaveBeenCalled();
  });

  it("يقصّ المسافات قبل المطابقة في كلا المسارين", async () => {
    const warehouseRow = fakeDrug({ id: "drug-wh-1", warehouseId: "wh-1" });
    const prisma = makeFakePrisma({ warehouseRow });
    const res = await resolveCatalogDrug(prisma, "wh-1", "  5012345678900  ");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.drug.id).toBe("drug-wh-1");
  });
});
