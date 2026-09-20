import { describe, it, expect } from "vitest";
import { buildShipmentRef, computeShipmentOrdinals, computeShipmentRefs } from "./shipment-ref";

const ORDER_NUMBER = "WO-51045DA4-AC5D-4358-BC2E-B76813799ABB";

describe("buildShipmentRef", () => {
  it("ينتج نفس القيمة عند استدعائه مرتين بنفس المدخلات (حتمي بلا وقت/عشوائية)", () => {
    const first = buildShipmentRef(ORDER_NUMBER, "item-1", 1);
    const second = buildShipmentRef(ORDER_NUMBER, "item-1", 1);
    expect(first).toBe(second);
  });

  it("يستخرج البادئة المميِّزة (WO + أول ثمانية أحرف من الـUUID) ويلحق ترتيب السطر", () => {
    expect(buildShipmentRef(ORDER_NUMBER, "item-1", 1)).toBe("WO-51045DA4-L1");
  });

  it("سطران مختلفان من نفس الطلب ينتجان مرجعين مختلفين", () => {
    const line1 = buildShipmentRef(ORDER_NUMBER, "item-1", 1);
    const line2 = buildShipmentRef(ORDER_NUMBER, "item-2", 2);
    expect(line1).not.toBe(line2);
  });

  it("رقم طلب null لا ينتج سلسلة عارية بلا معنى — يبقى مميَّزاً عبر هوية السطر", () => {
    const ref = buildShipmentRef(null, "abcdef1234567890", 1);
    expect(ref).not.toBe("-L1");
    expect(ref.length).toBeGreaterThan(4);
    expect(ref.endsWith("-L1")).toBe(true);
  });

  it("رقم طلب فارغ (نص فارغ/بياض) يُعامَل كغياب رقم — نفس سلوك null", () => {
    const empty = buildShipmentRef("", "abcdef1234567890", 1);
    const blank = buildShipmentRef("   ", "abcdef1234567890", 1);
    expect(empty).toBe(blank);
    expect(empty.endsWith("-L1")).toBe(true);
  });

  it("رقما طلب فارغان لسطرين مختلفين (itemId مختلف) ينتجان مرجعين مختلفين", () => {
    const a = buildShipmentRef(null, "aaaaaaaa-1111", 1);
    const b = buildShipmentRef(null, "bbbbbbbb-2222", 1);
    expect(a).not.toBe(b);
  });
});

describe("computeShipmentOrdinals", () => {
  it("يرتّب حسب itemId لا حسب موضع المصفوفة — نفس المدخلات بترتيب مختلف تنتج نفس الترقيم لكل سطر", () => {
    const idsA = ["item-b", "item-a", "item-c"];
    const idsB = ["item-c", "item-a", "item-b"];
    const ordinalsA = computeShipmentOrdinals(idsA);
    const ordinalsB = computeShipmentOrdinals(idsB);
    expect(ordinalsA.get("item-a")).toBe(ordinalsB.get("item-a"));
    expect(ordinalsA.get("item-b")).toBe(ordinalsB.get("item-b"));
    expect(ordinalsA.get("item-c")).toBe(ordinalsB.get("item-c"));
  });

  it("الترقيم يبدأ من 1 ويصعد أبجدياً", () => {
    const ordinals = computeShipmentOrdinals(["item-c", "item-a", "item-b"]);
    expect(ordinals.get("item-a")).toBe(1);
    expect(ordinals.get("item-b")).toBe(2);
    expect(ordinals.get("item-c")).toBe(3);
  });
});

describe("computeShipmentRefs", () => {
  it("إعادة الترتيب في مصفوفة المدخلات لا تغيّر قيمة أي سطر بعينه (ثبات إعادة التسعير)", () => {
    const ids = ["item-b", "item-a", "item-c"];
    const refsOriginal = computeShipmentRefs(ORDER_NUMBER, ids);
    const refsReordered = computeShipmentRefs(ORDER_NUMBER, [...ids].reverse());

    for (const id of ids) {
      expect(refsReordered.get(id)).toBe(refsOriginal.get(id));
    }
  });

  it("كل سطر في نفس الطلب يحصل على مرجع مختلف عن بقية الأسطر", () => {
    const refs = computeShipmentRefs(ORDER_NUMBER, ["item-a", "item-b", "item-c"]);
    const values = Array.from(refs.values());
    expect(new Set(values).size).toBe(values.length);
  });

  it("استدعاءان منفصلان بنفس المدخلات تماماً ينتجان نفس الخريطة (حتمي عبر إعادة تسعير متكرر)", () => {
    const ids = ["item-a", "item-b"];
    const first = computeShipmentRefs(ORDER_NUMBER, ids);
    const second = computeShipmentRefs(ORDER_NUMBER, ids);
    expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
  });
});
