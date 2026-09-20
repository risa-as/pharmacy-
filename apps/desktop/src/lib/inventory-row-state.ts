export type InventoryRow = {
  id: string;
  drug?: {
    id: string;
    isQuickSale?: boolean | null;
  };
};

export function upsertInventoryRow<T extends InventoryRow>(
  rows: T[],
  row: T | null | undefined,
): T[] {
  if (!row?.id) return rows;
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) return [row, ...rows];

  const next = rows.slice();
  next[index] = row;
  return next;
}

export function removeInventoryRow<T extends InventoryRow>(
  rows: T[],
  inventoryId: string | null | undefined,
): T[] {
  if (!inventoryId) return rows;
  return rows.filter((item) => item.id !== inventoryId);
}

export function shouldApplyInventorySnapshot(
  snapshotStartedAtRevision: number,
  currentRevision: number,
): boolean {
  return snapshotStartedAtRevision === currentRevision;
}
