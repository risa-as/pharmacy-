import { describe, expect, it } from "vitest";
import {
  analysisPeriod,
  baghdadDate,
  planRow,
  type PlanningRow,
  type PlanningOptions,
} from "../smart-purchasing";
const today = "2026-09-21";
const row: PlanningRow = {
  inventoryId: "i",
  drugId: "d",
  drugName: "Drug",
  scientificName: "",
  barcode: "123",
  branchId: "b",
  branchName: "B",
  minStock: 5,
  maxStock: 1000,
  cost: 100,
  unitsPerPack: 4,
  sold: 60,
  returned: 0,
  observedDays: 15,
  lots: [{ quantity: 18, expiryDate: "2027-01-01" }],
  incoming: [{ quantity: 10, date: today, confirmed: true, reference: "WAI" }],
  qualityReasons: [],
};
const options: PlanningOptions = {
  coverageDays: 15,
  leadDays: 0,
  safetyDays: 0,
  fromArrival: false,
};
const run = (
  changes: Partial<PlanningRow> = {},
  o: Partial<PlanningOptions> = {},
) => planRow({ ...row, ...changes }, { ...options, ...o }, today);
describe("purchasing decisions", () => {
  it("subtracts stock and incoming", () => {
    expect(run().averageDailySales).toBe(4);
    expect(run().suggestedQty).toBe(32);
    expect(run().packs).toBe(8);
  });
  it("changes coverage not historical sales", () => {
    expect(run({}, { coverageDays: 30 }).suggestedQty).toBe(92);
    expect(run({}, { coverageDays: 30 }).netSales).toBe(60);
  });
  it("adds lead time once", () =>
    expect(run({}, { leadDays: 3, fromArrival: true }).suggestedQty).toBe(44));
  it("does not fill max on zero sales", () => {
    expect(run({ sold: 0 }).suggestedQty).toBe(0);
    expect(run({ sold: 0 }).coverage).toBeNull();
  });
  it("includes zero stock with zero minimum", () => {
    expect(run({ sold: 0, minStock: 0, lots: [] }).out).toBe(true);
    expect(run({ sold: 0, minStock: 0, lots: [] }).action).toBe(true);
  });
  it("finds shortage above minimum", () => {
    expect(run().low).toBe(false);
    expect(run().insufficient).toBe(true);
  });
  it("excludes expired stock", () =>
    expect(
      run({ lots: [{ quantity: 100, expiryDate: "2026-09-20" }] }).suggestedQty,
    ).toBe(50));
  it("uses near-expiry before expiry", () =>
    expect(
      run({ lots: [{ quantity: 4, expiryDate: today }], incoming: [] })
        .suggestedQty,
    ).toBe(56));
  it("models expiry before use", () => {
    const p = run({
      lots: [{ quantity: 100, expiryDate: today }],
      incoming: [],
    });
    expect(p.suggestedQty).toBe(56);
    expect(p.expiredUnits).toBe(96);
  });
  it("does not count undated incoming", () =>
    expect(
      run({
        incoming: [
          { quantity: 100, date: null, confirmed: false, reference: "pending" },
        ],
      }).suggestedQty,
    ).toBe(42));
  it("late delivery cannot hide early shortage", () =>
    expect(
      run({
        lots: [],
        incoming: [
          {
            quantity: 100,
            date: "2026-09-28",
            confirmed: true,
            reference: "late",
          },
        ],
      }).suggestedQty,
    ).toBe(28));
  it("separates urgent lost demand without inventing backorders", () => {
    const p = run({ lots: [], incoming: [] }, { leadDays: 3 });
    expect(p.urgentUnits).toBe(12);
    expect(p.suggestedQty).toBe(48);
  });
  it("does not order after horizon", () => {
    const p = run({ lots: [], incoming: [] }, { leadDays: 20 });
    expect(p.urgentUnits).toBe(60);
    expect(p.suggestedQty).toBe(0);
  });
  it("rounds complete packs", () => {
    const p = run({ lots: [{ quantity: 17, expiryDate: "2027-01-01" }] });
    expect(p.suggestedQty).toBe(33);
    expect(p.packs).toBe(9);
  });
  it("does not guess packs", () =>
    expect(run({ unitsPerPack: null }).packs).toBeNull());
  it("accounts for linked returns", () =>
    expect(run({ returned: 30 }).suggestedQty).toBe(2));
  it("no mandatory minimum one", () =>
    expect(
      run({ lots: [{ quantity: 100, expiryDate: "2027-01-01" }] }).suggestedQty,
    ).toBe(0));
  it("explicit safety", () =>
    expect(run({}, { safetyDays: 2 }).suggestedQty).toBe(40));
  it("no division by zero", () =>
    expect(run({ observedDays: 0 }).averageDailySales).toBe(0));
  it.each([0, -1, 366, NaN, 1.5])("invalid coverage %s", (coverageDays) =>
    expect(() => run({}, { coverageDays })).toThrow(),
  );
});
describe("Baghdad dates", () => {
  const now = new Date("2026-09-21T10:00:00Z");
  it("30 complete days", () => {
    const p = analysisPeriod(undefined, undefined, now);
    expect(p.days).toBe(30);
    expect(p.to).toBe("2026-09-20");
    expect(p.end.toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });
  it("inclusive range", () =>
    expect(analysisPeriod("2026-09-06", "2026-09-20", now).days).toBe(15));
  it("local midnight", () =>
    expect(baghdadDate(new Date("2026-09-20T21:01:00Z"))).toBe("2026-09-21"));
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-09-21", "2026-09-21"],
    ["2026-09-20", "2026-09-19"],
    ["2024-01-01", "2026-09-20"],
  ])("invalid dates %s %s", (from, to) =>
    expect(() => analysisPeriod(from, to, now)).toThrow(),
  );
});
