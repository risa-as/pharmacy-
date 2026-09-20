import { describe, it, expect } from "vitest";
import { resolvePackUnits, type PackRow } from "../resolve-pack-units";

// إصلاح PACK_UNITS_UNRESOLVED الزائف: نفس الباركود قد يملك أكثر من صفّ
// GlobalDrug (خاص بالصيدلية + عالمي/مذخر مشترك) — انظر تعليق أعلى الملف
// المختبَر. هذه الحالات تطابق الإنتاج الحقيقي المذكور في التشخيص: صفّ خاص
// مؤكَّد (unitsPerPack=1, confirmed=true) وصفّ عالمي بلا شيء (null, false).

describe("resolvePackUnits", () => {
  it("صفّ واحد مؤكَّد → RESOLVED بقيمته وconfirmed:true", () => {
    const rows: PackRow[] = [{ unitsPerPack: 1, unitsPerPackConfirmedAt: new Date("2026-01-01") }];
    expect(resolvePackUnits(rows)).toEqual({ kind: "RESOLVED", unitsPerPack: 1, confirmed: true });
  });

  it("مؤكَّد + غير مؤكَّد مختلفان → المؤكَّد يفوز، ليس تعارضاً (حالة الإنتاج الحقيقية)", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 1, unitsPerPackConfirmedAt: new Date("2026-01-01") }, // صفّ الصيدلية الخاص
      { unitsPerPack: null, unitsPerPackConfirmedAt: null }, // الصفّ العالمي الذي يرجع إليه الطلب
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "RESOLVED", unitsPerPack: 1, confirmed: true });
  });

  it("مؤكَّد + غير مؤكَّد بقيمة مختلفة فعلاً → المؤكَّد يفوز رغم الاختلاف", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 10, unitsPerPackConfirmedAt: new Date("2026-01-01") },
      { unitsPerPack: 5, unitsPerPackConfirmedAt: null },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "RESOLVED", unitsPerPack: 10, confirmed: true });
  });

  it("صفّان مؤكَّدان مختلفان → CONFLICT (تعارض بشري حقيقي يحتاج مراجعة)", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 10, unitsPerPackConfirmedAt: new Date("2026-01-01") },
      { unitsPerPack: 20, unitsPerPackConfirmedAt: new Date("2026-02-01") },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "CONFLICT", values: [10, 20] });
  });

  it("صفوف غير مؤكَّدة فقط متفقة → RESOLVED وconfirmed:false (يحافظ على السلوك القديم)", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 4, unitsPerPackConfirmedAt: null },
      { unitsPerPack: 4, unitsPerPackConfirmedAt: null },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "RESOLVED", unitsPerPack: 4, confirmed: false });
  });

  it("صفّان غير مؤكَّدين مختلفان → CONFLICT", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 4, unitsPerPackConfirmedAt: null },
      { unitsPerPack: 8, unitsPerPackConfirmedAt: null },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "CONFLICT", values: [4, 8] });
  });

  it("مصفوفة فارغة → UNKNOWN", () => {
    expect(resolvePackUnits([])).toEqual({ kind: "UNKNOWN" });
  });

  it("كل القيم null → UNKNOWN", () => {
    const rows: PackRow[] = [
      { unitsPerPack: null, unitsPerPackConfirmedAt: null },
      { unitsPerPack: null, unitsPerPackConfirmedAt: new Date("2026-01-01") },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "UNKNOWN" });
  });

  it("قيم غير صالحة (0، سالبة، كسرية) تُتجاهَل تماماً كأنها غير موجودة", () => {
    const rows: PackRow[] = [
      { unitsPerPack: 0, unitsPerPackConfirmedAt: new Date("2026-01-01") },
      { unitsPerPack: -3, unitsPerPackConfirmedAt: new Date("2026-01-01") },
      { unitsPerPack: 2.5, unitsPerPackConfirmedAt: new Date("2026-01-01") },
    ];
    expect(resolvePackUnits(rows)).toEqual({ kind: "UNKNOWN" });

    // ويبقى صفّ صالح واحد وسط قيم غير صالحة كافياً للحسم.
    const withOneValid: PackRow[] = [...rows, { unitsPerPack: 6, unitsPerPackConfirmedAt: new Date("2026-01-01") }];
    expect(resolvePackUnits(withOneValid)).toEqual({ kind: "RESOLVED", unitsPerPack: 6, confirmed: true });
  });

  it("confirmedAt كنص (JSON مصريَّف) يُعامَل كمؤكَّد أيضاً طالما ليس null", () => {
    const rows: PackRow[] = [{ unitsPerPack: 3, unitsPerPackConfirmedAt: "2026-01-01T00:00:00.000Z" }];
    expect(resolvePackUnits(rows)).toEqual({ kind: "RESOLVED", unitsPerPack: 3, confirmed: true });
  });
});
