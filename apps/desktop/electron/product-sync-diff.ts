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
