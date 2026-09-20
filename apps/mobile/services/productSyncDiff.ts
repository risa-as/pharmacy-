export interface LocalProductRow {
    id: string;
    drugName: string | null;
    tradeName: string | null;
    scientificName: string | null;
    quantity: number;
    price: number;
    reorderLevel: number;
    branchId: string | null;
    barcode: string;
}

const textOrNull = (value: unknown): string | null => (
    value === undefined || value === null ? null : String(value)
);

const textOrEmpty = (value: unknown): string => (
    value === undefined || value === null ? '' : String(value)
);

const numberOrZero = (value: unknown): number => {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

function requireProductId(product: any): string {
    const id = textOrEmpty(product?.id).trim();
    if (!id) throw new TypeError('Product snapshot row is missing a valid id');
    return id;
}

export function normalizeProductRow(product: any): LocalProductRow {
    const drugName = textOrNull(product?.drugName);
    const tradeName = textOrNull(product?.tradeName) ?? drugName;

    return {
        id: requireProductId(product),
        drugName,
        tradeName,
        scientificName: textOrNull(product?.scientificName),
        quantity: numberOrZero(product?.quantity),
        price: numberOrZero(product?.price),
        reorderLevel: numberOrZero(product?.reorderLevel),
        branchId: textOrNull(product?.branchId),
        barcode: textOrEmpty(product?.barcode),
    };
}

function sameProductRow(left: LocalProductRow, right: LocalProductRow): boolean {
    return left.id === right.id &&
        left.drugName === right.drugName &&
        left.tradeName === right.tradeName &&
        left.scientificName === right.scientificName &&
        left.quantity === right.quantity &&
        left.price === right.price &&
        left.reorderLevel === right.reorderLevel &&
        left.branchId === right.branchId &&
        left.barcode === right.barcode;
}

export function getProductSnapshotChanges(
    snapshot: any[],
    currentRows: LocalProductRow[],
): { upserts: LocalProductRow[]; deleteIds: string[] } {
    if (!Array.isArray(snapshot)) throw new TypeError('Product snapshot must be an array');

    const nextById = new Map<string, LocalProductRow>();
    for (const product of snapshot) {
        const row = normalizeProductRow(product);
        nextById.set(row.id, row);
    }

    const currentById = new Map(currentRows.map(row => [row.id, normalizeProductRow(row)]));
    const upserts: LocalProductRow[] = [];
    const deleteIds: string[] = [];

    for (const [id, nextRow] of nextById) {
        const currentRow = currentById.get(id);
        if (!currentRow || !sameProductRow(currentRow, nextRow)) {
            upserts.push(nextRow);
        }
    }

    for (const id of currentById.keys()) {
        if (!nextById.has(id)) deleteIds.push(id);
    }

    return { upserts, deleteIds };
}
