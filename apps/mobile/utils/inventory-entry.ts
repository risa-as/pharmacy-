/** Viewing all branches never chooses a stock-in destination implicitly. */
export function inventoryEntryBranch(isAdmin: boolean, selectedBranch: string | null, assignedBranch: string | null): string | null {
    const branch = isAdmin ? selectedBranch : assignedBranch;
    return branch?.trim() || null;
}

/** Scanner navigation may recreate the screen before the selector loads. */
export async function resolveInventoryEntryBranch(
    isAdmin: boolean,
    selectedBranch: string | null,
    assignedBranch: string | null,
    loadBranches: () => Promise<Array<{ id: string }>>,
    currentSelection: () => string | null = () => selectedBranch,
): Promise<string | null> {
    const chosen = inventoryEntryBranch(isAdmin, selectedBranch, assignedBranch);
    if (chosen || !isAdmin) return chosen;
    const branches = await loadBranches();
    const updated = inventoryEntryBranch(true, currentSelection(), assignedBranch);
    if (updated) return updated;
    if (!branches.length) throw new Error('تعذر تحميل الفروع. تحقق من الاتصال ثم أعد المحاولة.');
    return branches.length === 1 ? branches[0].id : null;
}

/** A failed barcode lookup is not evidence that a new drug should be created. */
export function inventoryBarcodeDestination(result: { success?: boolean; exists?: boolean; inventory?: unknown; drug?: unknown }): 'batch' | 'branch' | 'create' | 'blocked' {
    if (result.success !== true) return 'blocked';
    if (result.exists === false) return 'create';
    if (result.exists !== true) return 'blocked';
    if (result.inventory) return 'batch';
    return result.drug ? 'branch' : 'blocked';
}
