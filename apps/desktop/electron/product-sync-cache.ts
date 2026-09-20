export type ProductSyncSnapshot = {
    drugs: any[];
    meta?: {
        branchId: string;
        inventoryIds: string[];
        drugIds: string[];
        [key: string]: any;
    };
};

export type ProductSnapshotCacheKeyInput = {
    apiBaseUrl: string;
    branchId: string;
    authHeaders: Record<string, string>;
};

export type ProductSnapshotFetchResponse = {
    status: number;
    ok: boolean;
    headers: {
        get(name: string): string | null;
    };
    json(): Promise<unknown>;
};

export type ProductSnapshotFetcher = (
    headers: Record<string, string>,
) => Promise<ProductSnapshotFetchResponse>;

type CachedProductSnapshot = {
    etag: string;
    snapshot: ProductSyncSnapshot;
};

export type ProductSyncSnapshotFetchResult = {
    snapshot: ProductSyncSnapshot;
    etag: string | null;
    fromCache: boolean;
};

const productSnapshotCache = new Map<string, CachedProductSnapshot>();
const MAX_PRODUCT_SNAPSHOT_CACHE_ENTRIES = 3;

function normalizeHeaderName(name: string): string {
    return name.trim().toLowerCase();
}

function normalizeHeaderValue(value: string): string {
    return value.trim();
}

export function buildProductSnapshotCacheKey(input: ProductSnapshotCacheKeyInput): string {
    const authParts = Object.entries(input.authHeaders)
        .filter(([, value]) => normalizeHeaderValue(String(value || '')).length > 0)
        .map(([name, value]) => [normalizeHeaderName(name), normalizeHeaderValue(String(value))] as const)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}:${value}`);

    return JSON.stringify({
        apiBaseUrl: input.apiBaseUrl.replace(/\/+$/, ''),
        branchId: input.branchId,
        auth: authParts,
    });
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasValidDrugRows(value: ProductSyncSnapshot): boolean {
    return value.drugs.every((drug) => (
        drug
        && typeof drug === 'object'
        && typeof drug.id === 'string'
        && drug.id.trim().length > 0
    ));
}

export function isValidProductSyncSnapshot(value: unknown): value is ProductSyncSnapshot {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as ProductSyncSnapshot;
    if (!Array.isArray(snapshot.drugs)) return false;
    return hasValidDrugRows(snapshot);
}

export function isCacheableProductSyncSnapshot(
    value: ProductSyncSnapshot,
    branchId: string,
): boolean {
    if (!value.meta || typeof value.meta !== 'object') return false;
    if (value.meta.branchId !== branchId) return false;
    if (!isStringArray(value.meta.inventoryIds)) return false;
    if (!isStringArray(value.meta.drugIds)) return false;
    return hasValidDrugRows(value);
}

export function clearProductSnapshotCache() {
    productSnapshotCache.clear();
}

export async function fetchProductSyncSnapshotWithCache(
    keyInput: ProductSnapshotCacheKeyInput,
    fetcher: ProductSnapshotFetcher,
): Promise<ProductSyncSnapshotFetchResult> {
    const cacheKey = buildProductSnapshotCacheKey(keyInput);
    const cached = productSnapshotCache.get(cacheKey);
    const headers: Record<string, string> = {};

    if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
    }

    const response = await fetcher(headers);
    const responseEtag = response.headers.get('etag') || response.headers.get('ETag');

    if (response.status === 304 && cached) {
        return {
            snapshot: cached.snapshot,
            etag: responseEtag || cached.etag,
            fromCache: true,
        };
    }

    if (!response.ok) {
        throw new Error(`Product sync failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    if (!isValidProductSyncSnapshot(body)) {
        throw new Error('Product sync response was missing a valid drugs array');
    }
    if (body.meta && body.meta.branchId !== keyInput.branchId) {
        throw new Error(`Product sync response branch mismatch: expected ${keyInput.branchId}, received ${body.meta.branchId}`);
    }

    if (responseEtag && isCacheableProductSyncSnapshot(body, keyInput.branchId)) {
        productSnapshotCache.set(cacheKey, {
            etag: responseEtag,
            snapshot: body,
        });
        while (productSnapshotCache.size > MAX_PRODUCT_SNAPSHOT_CACHE_ENTRIES) {
            const oldestKey = productSnapshotCache.keys().next().value;
            if (!oldestKey) break;
            productSnapshotCache.delete(oldestKey);
        }
    } else {
        productSnapshotCache.delete(cacheKey);
    }

    return {
        snapshot: body,
        etag: responseEtag,
        fromCache: false,
    };
}
