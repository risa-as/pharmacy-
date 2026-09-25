export type ProductSyncComparable =
    | string
    | number
    | boolean
    | Date
    | null
    | undefined;

export type ProductSyncData = Record<string, ProductSyncComparable>;

function comparableValue(value: ProductSyncComparable) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.getTime();
    }
    return value;
}

export function productSyncValuesEqual(
    current: ProductSyncComparable,
    incoming: ProductSyncComparable,
): boolean {
    return Object.is(comparableValue(current), comparableValue(incoming));
}

export function changedProductSyncData<T extends ProductSyncData>(
    current: ProductSyncData | null | undefined,
    incoming: T,
): Partial<T> {
    const changed: Partial<T> = {};

    for (const [key, value] of Object.entries(incoming) as Array<[keyof T, T[keyof T]]>) {
        if (value === undefined) continue;
        if (!current || !productSyncValuesEqual(current[String(key)], value)) {
            changed[key] = value;
        }
    }

    return changed;
}

export function hasChangedProductSyncData(
    current: ProductSyncData | null | undefined,
    incoming: ProductSyncData,
): boolean {
    return Object.keys(changedProductSyncData(current, incoming)).length > 0;
}

export function isValidPackUnits(value: unknown): value is number {
    return typeof value === 'number'
        && Number.isInteger(value)
        && value > 0
        && value <= 2147483647;
}

export function shouldPreservePendingPackUnits(input: {
    hasPendingLocalEdits: boolean;
    localUnitsPerPack?: number | null;
    localUnitsPerPackConfirmedAt?: Date | string | null;
    cloudUnitsPerPack?: number | null;
    cloudUnitsPerPackConfirmedAt?: Date | string | null;
}): boolean {
    if (!input.hasPendingLocalEdits) return false;
    if (!isValidPackUnits(input.localUnitsPerPack)) return false;
    if (input.localUnitsPerPackConfirmedAt == null) return false;

    return input.cloudUnitsPerPack !== input.localUnitsPerPack
        || input.cloudUnitsPerPackConfirmedAt == null;
}

export function mergePendingInventoryUpdatePayload(
    previousPayload: Record<string, unknown> | null | undefined,
    nextPayload: Record<string, unknown>,
): Record<string, unknown> {
    if (
        previousPayload
        && nextPayload.unitsPerPack === undefined
        && previousPayload.unitsPerPack !== undefined
    ) {
        return { ...previousPayload, ...nextPayload, unitsPerPack: previousPayload.unitsPerPack };
    }

    return { ...(previousPayload || {}), ...nextPayload };
}
