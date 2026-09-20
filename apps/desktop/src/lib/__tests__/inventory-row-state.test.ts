import { describe, expect, it } from "vitest";
import {
  removeInventoryRow,
  shouldApplyInventorySnapshot,
  upsertInventoryRow,
} from "../inventory-row-state";

const row = (id: string, quick = false) => ({
  id,
  drug: { id: `drug-${id}`, isQuickSale: quick },
});

describe("inventory row state helpers", () => {
  it("replaces an affected row without moving other rows", () => {
    const existing = [row("a"), row("b"), row("c")];
    const updated = { ...row("b", true), quantity: 12 };

    expect(upsertInventoryRow(existing, updated)).toEqual([
      existing[0],
      updated,
      existing[2],
    ]);
  });

  it("prepends a newly created inventory row", () => {
    const existing = [row("a"), row("b")];
    const created = row("new");

    expect(upsertInventoryRow(existing, created)).toEqual([
      created,
      ...existing,
    ]);
  });

  it("removes only the deleted row", () => {
    const existing = [row("a"), row("b"), row("c")];

    expect(removeInventoryRow(existing, "b")).toEqual([
      existing[0],
      existing[2],
    ]);
  });

  it("rejects a full snapshot that started before a newer row mutation", () => {
    expect(shouldApplyInventorySnapshot(3, 4)).toBe(false);
    expect(shouldApplyInventorySnapshot(4, 4)).toBe(true);
  });
});
