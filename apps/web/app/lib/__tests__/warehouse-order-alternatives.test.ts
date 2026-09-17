import { describe, it, expect, vi } from "vitest";
import {
  buildAlternativesByItemId,
  type OrderItemForAlternatives,
  type WarehouseCatalogFinder,
} from "../warehouse-order-alternatives";

function fakePrisma(rows: any[]): { prisma: WarehouseCatalogFinder; findMany: ReturnType<typeof vi.fn> } {
  const findMany = vi.fn(async () => rows);
  return { prisma: { warehouseCatalogItem: { findMany } }, findMany };
}

function item(id: string, barcode: string, alternatives: string[]): OrderItemForAlternatives {
  return { id, drug: { barcode, alternatives } };
}

describe("buildAlternativesByItemId", () => {
  it("issues zero queries and returns an empty-array map when no item has any alternative", async () => {
    const { prisma, findMany } = fakePrisma([]);
    const items = [item("i1", "B1", []), item("i2", "B2", [])];
    const result = await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(findMany).not.toHaveBeenCalled();
    expect(result.get("i1")).toEqual([]);
    expect(result.get("i2")).toEqual([]);
  });

  it("issues exactly one query covering the union of every item's alternative barcodes", async () => {
    const { prisma, findMany } = fakePrisma([]);
    const items = [item("i1", "B1", ["ALT_A", "ALT_B"]), item("i2", "B2", ["ALT_B", "ALT_C"])];
    await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.where.warehouseId).toBe("wh-1");
    expect(new Set(args.where.barcode.in)).toEqual(new Set(["ALT_A", "ALT_B", "ALT_C"]));
  });

  it("scopes each item's result to only the barcodes it listed, in its own order", async () => {
    const rows = [
      { barcode: "ALT_A", price: 100, isAvailable: true, drug: { tradeName: "أ" }, batches: [{ id: "b1", quantity: 5, expiryDate: new Date("2099-01-01") }] },
      { barcode: "ALT_B", price: 200, isAvailable: true, drug: { tradeName: "ب" }, batches: [{ id: "b2", quantity: 5, expiryDate: new Date("2099-01-01") }] },
      { barcode: "ALT_C", price: 300, isAvailable: true, drug: { tradeName: "ج" }, batches: [{ id: "b3", quantity: 5, expiryDate: new Date("2099-01-01") }] },
    ];
    const { prisma } = fakePrisma(rows);
    const items = [item("i1", "B1", ["ALT_B", "ALT_A"]), item("i2", "B2", ["ALT_C"])];
    const result = await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(result.get("i1")!.map((r) => r.barcode)).toEqual(["ALT_B", "ALT_A"]);
    expect(result.get("i2")!.map((r) => r.barcode)).toEqual(["ALT_C"]);
  });

  it("excludes an item's own barcode from its alternative candidates", async () => {
    const rows = [
      { barcode: "B1", price: 100, isAvailable: true, drug: { tradeName: "نفس الصنف" }, batches: [{ id: "b1", quantity: 5, expiryDate: new Date("2099-01-01") }] },
    ];
    const { prisma, findMany } = fakePrisma(rows);
    // B1 يذكر نفسه ضمن بدائله — خطأ بيانات محتمَل يجب ألا يمر.
    const items = [item("i1", "B1", ["B1"])];
    const result = await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(findMany).not.toHaveBeenCalled(); // الاتحاد بعد الاستبعاد فارغ
    expect(result.get("i1")).toEqual([]);
  });

  it("excludes unlisted (isAvailable=false) and out-of-stock catalog rows via rankAlternatives", async () => {
    const rows = [
      { barcode: "ALT_A", price: 100, isAvailable: false, drug: { tradeName: "أ" }, batches: [{ id: "b1", quantity: 5, expiryDate: new Date("2099-01-01") }] },
      { barcode: "ALT_B", price: 200, isAvailable: true, drug: { tradeName: "ب" }, batches: [] },
    ];
    const { prisma } = fakePrisma(rows);
    const items = [item("i1", "B1", ["ALT_A", "ALT_B"])];
    const result = await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(result.get("i1")).toEqual([]);
  });

  it("computes sellableQuantity via summarizeStock (excludes expired batches)", async () => {
    const rows = [
      {
        barcode: "ALT_A",
        price: 100,
        isAvailable: true,
        drug: { tradeName: "أ" },
        batches: [
          { id: "b1", quantity: 10, expiryDate: new Date("2000-01-01") }, // منتهي
          { id: "b2", quantity: 7, expiryDate: new Date("2099-01-01") },
        ],
      },
    ];
    const { prisma } = fakePrisma(rows);
    const items = [item("i1", "B1", ["ALT_A"])];
    const result = await buildAlternativesByItemId(prisma, "wh-1", items);
    expect(result.get("i1")).toEqual([{ barcode: "ALT_A", tradeName: "أ", price: 100, sellableQuantity: 7 }]);
  });
});
