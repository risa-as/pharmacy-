import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  ORDER_TRANSITIONS,
  TERMINAL_STATUSES,
} from "../warehouse-order-state";

describe("آلة حالات طلب المذخر", () => {
  it("كل الحالات لها مدخلات في جدول الانتقالات", () => {
    const statuses = Object.keys(ORDER_TRANSITIONS);
    expect(statuses.sort()).toEqual(
      [
        "DRAFT",
        "SENT",
        "UNDER_REVIEW",
        "QUOTED",
        "APPROVED",
        "REJECTED",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ].sort()
    );
  });

  it("المسار السعيد الكامل: DRAFT → SENT → UNDER_REVIEW → QUOTED → APPROVED → SHIPPED → DELIVERED", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("SENT", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "QUOTED")).toBe(true);
    expect(canTransition("QUOTED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("لا يمكن الشحن قبل الاعتماد", () => {
    expect(canTransition("SENT", "SHIPPED")).toBe(false);
    expect(canTransition("UNDER_REVIEW", "SHIPPED")).toBe(false);
    expect(canTransition("QUOTED", "SHIPPED")).toBe(false);
    expect(canTransition("DRAFT", "SHIPPED")).toBe(false);
  });

  it("لا يمكن الاعتماد إلا من عرض سعر QUOTED", () => {
    expect(canTransition("SENT", "APPROVED")).toBe(false);
    expect(canTransition("UNDER_REVIEW", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
  });

  it("الإلغاء مسموح قبل الشحن فقط", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransition("SENT", "CANCELLED")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "CANCELLED")).toBe(true);
    expect(canTransition("QUOTED", "CANCELLED")).toBe(true);
    expect(canTransition("APPROVED", "CANCELLED")).toBe(true);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
  });

  it("الحالات النهائية لا انتقالات خارجة منها", () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(ORDER_TRANSITIONS[terminal]).toEqual([]);
      for (const target of Object.keys(ORDER_TRANSITIONS)) {
        expect(canTransition(terminal as any, target as any)).toBe(false);
      }
    }
  });

  it("الرفض لا يأتي إلا على عرض سعر، ولا إعادة فتح بعده", () => {
    expect(canTransition("QUOTED", "REJECTED")).toBe(true);
    expect(canTransition("SENT", "REJECTED")).toBe(false);
    expect(canTransition("REJECTED", "SENT")).toBe(false);
    expect(canTransition("REJECTED", "DRAFT")).toBe(false);
  });

  it("المرحلة 6 — جسر الشحن/التسليم: الانتقالات التي فتحها مسار PATCH .../shipping", () => {
    expect(canTransition("APPROVED", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition("APPROVED", "DELIVERED")).toBe(false); // لا يمكن تخطي الشحن
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    for (const target of Object.keys(ORDER_TRANSITIONS)) {
      expect(canTransition("DELIVERED", target as any)).toBe(false);
    }
  });

  it("assertTransition يمرر الشرعي ويرمي رسالة عربية لغير الشرعي", () => {
    expect(() => assertTransition("QUOTED", "APPROVED")).not.toThrow();
    try {
      assertTransition("SHIPPED", "CANCELLED");
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("انتقال غير شرعي");
      expect(e.message).toContain("SHIPPED");
      expect(e.message).toContain("CANCELLED");
    }
  });
});
