import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { pollingService } from './polling';

// متغير لتخزين الرابط في الذاكرة لتجنب القراءة من الستورج في كل طلب
/**
 * The server is fixed by the build, never by the user: EAS profiles set
 * EXPO_PUBLIC_API_URL (eas.json), and local development sets it in `.env`
 * (restart Metro with `--clear` after changing it).
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://app.faramace.com/api';

// Older versions let users save a server address that overrode the build's.
// Drop it once so it can never take effect again.
let legacyServerUrlCleared = false;

export const getBaseUrl = async (): Promise<string> => {
    if (!legacyServerUrlCleared) {
        legacyServerUrlCleared = true;
        AsyncStorage.removeItem('server_url').catch(() => {});
    }
    return API_URL;
};


// In-memory token cache — avoids slow SecureStore reads on every API call
let cachedToken: string | null | undefined = undefined; // undefined = not loaded yet

// Branch list cache — shared across all BranchSelector instances
let _branchCache: any[] | null = null;
let _branchCacheTs = 0;

// ─── Response cache (GET only) ───────────────────────────────────────────────
// Keyed by full endpoint string (path + query). TTL per path prefix.
interface _CacheEntry { data: unknown; ts: number }
const _responseCache = new Map<string, _CacheEntry>();
const _cacheGenerations = new Map<string, number>();
let _sessionGeneration = 0;
const _CACHE_TTL: Array<[string, number]> = [
    ['/stats',               30_000],  // 30 s
    ['/alerts',              30_000],  // 30 s
    ['/inventory',           60_000],  // 1 min
    ['/smart-order',         60_000],  // 1 min
    ['/purchases/low-stock', 60_000],  // 1 min
    ['/reports',            120_000],  // 2 min
    ['/debts',               60_000],  // 1 min
];
function _cacheTTL(endpoint: string): number {
    const path = endpoint.split('?')[0];
    for (const [prefix, ttl] of _CACHE_TTL) {
        if (path.startsWith(prefix)) return ttl;
    }
    return 0;
}

// ─── Per-path request timeout ─────────────────────────────────────────────────
// Weekly / monthly reports aggregate large date ranges on the server and can
// exceed the default 8 s limit. Override per path prefix as needed.
const _TIMEOUT_MS: Array<[string, number]> = [
    ['/reports', 25_000],  // 25 s — aggregation queries can be slow
];
function _requestTimeout(endpoint: string): number {
    const path = endpoint.split('?')[0];
    for (const [prefix, ms] of _TIMEOUT_MS) {
        if (path.startsWith(prefix)) return ms;
    }
    return 8_000; // default
}
function _cacheScope(endpoint: string): string {
    const path = endpoint.split('?')[0];
    // Every filtered/branch inventory list describes the same inventory
    // collection, so a stock mutation invalidates each cached variant.
    if (path === '/inventory' || path === '/inventory/page') return '/inventory';
    // Reports have several cached child routes; invalidating the report family
    // must retire those entries and their in-flight requests as one unit.
    if (path === '/reports' || path.startsWith('/reports/')) return '/reports';
    return path;
}

function _invalidateCacheScope(endpoint: string) {
    const scope = _cacheScope(endpoint);
    _cacheGenerations.set(scope, (_cacheGenerations.get(scope) ?? 0) + 1);
    for (const key of _responseCache.keys()) {
        if (_cacheScope(key) === scope) _responseCache.delete(key);
    }
    for (const key of _inflight.keys()) {
        if (_cacheScope(key) === scope) _inflight.delete(key);
    }
}

// Keep the original exact-path invalidation behaviour for all successful
// writes. The inventory mutation policy below additionally clears related
// collection and dashboard reads.
function _clearRelatedCache(endpoint: string) {
    _invalidateCacheScope(endpoint);
}

const _INVENTORY_MUTATION_PATHS = new Set([
    '/inventory/add-batch',
    '/inventory/add-to-branch',
    '/inventory/create-quick',
    '/inventory/quick-sale',
]);

function _isSuccessfulInventoryMutation(endpoint: string, result: unknown): boolean {
    const path = endpoint.split('?')[0];
    if (!_INVENTORY_MUTATION_PATHS.has(path) && path !== '/sales' && !/^\/purchases\/[^/]+\/receive$/.test(path)) return false;
    // Inventory routes return `{ success: boolean }`. Do not evict a useful
    // cache entry for a domain-level failure that was returned as HTTP 200.
    return !!result && typeof result === 'object' && (result as { success?: unknown }).success === true;
}

function _invalidateInventoryCaches() {
    for (const endpoint of [
        '/inventory',
        '/stats',
        '/alerts',
        '/smart-order',
        '/purchases/low-stock',
        '/reports',
    ]) {
        _invalidateCacheScope(endpoint);
    }
}

// ─── In-flight deduplication (GET only) ──────────────────────────────────────
// If the same endpoint is already being fetched, reuse the same Promise instead
// of firing a duplicate network request.
const _inflight = new Map<string, Promise<unknown>>();

export function setCachedToken(token: string | null) {
    if (cachedToken !== token) {
        _sessionGeneration++;
        _branchCache = null;
        _responseCache.clear();
        _inflight.clear();
    }
    cachedToken = token;
}

// دالة مساعدة لقراءة التوكن من التخزين الآمن
async function getStoredToken(expectedSessionGeneration = _sessionGeneration): Promise<string | null> {
    if (cachedToken !== undefined) return cachedToken;
    try {
        const token = await SecureStore.getItemAsync('authToken');
        // A late storage read from the old account must not overwrite a token
        // set by a new login or refresh while this await was pending.
        if (expectedSessionGeneration === _sessionGeneration && cachedToken === undefined) {
            cachedToken = token;
        }
        return token;
    } catch {
        const token = await AsyncStorage.getItem('authToken');
        if (expectedSessionGeneration === _sessionGeneration && cachedToken === undefined) {
            cachedToken = token;
        }
        return token;
    }
}

// Flag to prevent further API calls after session expires.
// Avoids an infinite loop where polling jobs keep hitting 401 repeatedly.
let sessionExpired = false;

// Optional callback registered by AuthContext so it can clear React state
// when the session expires without creating a circular import dependency.
let _sessionExpiredHandler: (() => void) | null = null;
export function registerSessionExpiredHandler(fn: () => void) {
    _sessionExpiredHandler = fn;
}

// معالجة انتهاء الجلسة — خروج تلقائي عند 401
async function handleSessionExpiry() {
    if (sessionExpired) return; // already handled — don't run twice
    sessionExpired = true;

    // Stop all background polling immediately so no more requests are made
    pollingService.unregisterAll();

    // Notify AuthContext to clear its React user state so the next login
    // always gets the freshly-stored user, not stale admin/previous user data.
    _sessionExpiredHandler?.();

    _sessionGeneration++;
    cachedToken = null;       // Clear token cache
    _branchCache = null;      // Clear branch cache
    _responseCache.clear();   // Clear all response caches
    _inflight.clear();        // Clear any pending in-flight requests
    try {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('user');
    } catch {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('user');
    }
    // التوجيه لشاشة تسجيل الدخول
    setTimeout(() => {
        try {
            router.replace('/login');
        } catch (e) {
            console.error('Could not navigate to login', e);
        }
    }, 100);
}

/** Reset the session-expired flag on a fresh login so polling can resume. */
export function resetSessionExpired() {
    sessionExpired = false;
}

/** A fresh idempotency key for one mutation attempt. */
export function newIdempotencyKey(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

// Determines if an error is a network/timeout failure (safe to retry)
export function isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
        msg.includes('network request failed') ||
        msg.includes('aborted') ||
        msg.includes('timeout') ||
        msg.includes('failed to fetch') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound')
    );
}

// Core fetch — single attempt, no retry logic here
async function fetchOnce<T>(
    endpoint: string,
    options: RequestInit,
    token: string | null,
    baseUrl: string,
    noAutoLogout = false,
    timeoutMs = 8_000,
    sessionGeneration = _sessionGeneration,
): Promise<T> {
    // Short-circuit immediately if the session has already expired.
    if (sessionExpired) {
        throw new Error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً');
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (__DEV__) console.log(`[API] ${options.method ?? 'GET'} ${cleanEndpoint}`);

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}${cleanEndpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // A response authenticated with an old account must not log out or
        // return data into a newer session after the token has changed.
        if (sessionGeneration !== _sessionGeneration) {
            throw new Error('Session changed while the request was in flight');
        }

        if (response.status === 401) {
            if (noAutoLogout) {
                // Background/polling call — throw silently without wiping the session
                throw new Error('انتهت صلاحية الجلسة');
            }
            console.warn('[API] Session expired (401). Auto-logging out.');
            await handleSessionExpiry();
            throw new Error('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً');
        }

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.message || `HTTP ${response.status}: ${response.statusText}`);
            } catch (e) {
                if (e instanceof Error && e.message.includes('انتهت صلاحية')) throw e;
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }

        const result = await response.json() as T;
        if (sessionGeneration !== _sessionGeneration) {
            throw new Error('Session changed while the request was in flight');
        }
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Helper to make authenticated requests with exponential backoff retry on network errors
async function request<T>(
    endpoint: string,
    options: RequestInit = {},
    noAutoLogout = false,
    behavior: { forceRefresh?: boolean } = {},
): Promise<T> {
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const cacheScope = _cacheScope(endpoint);
    const sessionGeneration = _sessionGeneration;

    // A manual refresh needs a new server response, not a cache hit or a
    // previously-started request. Advancing the generation also prevents that
    // older request from writing its result into the cache when it finishes.
    if (isGet && behavior.forceRefresh) _invalidateCacheScope(endpoint);

    // ── 1. Response cache (GET only) ─────────────────────────────────────────
    if (isGet && !behavior.forceRefresh) {
        const ttl = _cacheTTL(endpoint);
        if (ttl > 0) {
            const hit = _responseCache.get(endpoint);
            if (hit && Date.now() - hit.ts < ttl) return hit.data as T;
        }
    }

    // ── 2. In-flight deduplication (GET only) ────────────────────────────────
    if (isGet && !behavior.forceRefresh) {
        const pending = _inflight.get(endpoint);
        if (pending) return pending as Promise<T>;
    }

    const cacheGeneration = _cacheGenerations.get(cacheScope) ?? 0;

    const MAX_RETRIES = 2;
    const BACKOFF_MS = [300, 800];
    const timeoutMs = _requestTimeout(endpoint);

    const execute = async (): Promise<T> => {
        // Register the in-flight promise before yielding for token storage,
        // so simultaneous callers also share request preparation.
        const [token, baseUrl] = await Promise.all([getStoredToken(sessionGeneration), getBaseUrl()]);
        if (sessionGeneration !== _sessionGeneration) {
            throw new Error('Session changed while the request was being prepared');
        }
        let lastError: unknown;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await fetchOnce<T>(endpoint, options, token, baseUrl, noAutoLogout, timeoutMs, sessionGeneration);
                // Store in response cache on success
                if (isGet) {
                    const ttl = _cacheTTL(endpoint);
                    if (
                        ttl > 0 &&
                        sessionGeneration === _sessionGeneration &&
                        cacheGeneration === (_cacheGenerations.get(cacheScope) ?? 0)
                    ) {
                        _responseCache.set(endpoint, { data: result, ts: Date.now() });
                        // Search/page combinations otherwise accumulate for the
                        // whole session even after their TTL has expired.
                        while (_responseCache.size > 100) {
                            _responseCache.delete(_responseCache.keys().next().value!);
                        }
                    }
                }
                return result;
            } catch (error) {
                lastError = error;
                if (!isNetworkError(error) || attempt === MAX_RETRIES) break;
                const delay = BACKOFF_MS[attempt] ?? 4000;
                if (__DEV__) console.warn(`[API] Retry ${attempt + 1} for ${endpoint} in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    };

    if (isGet) {
        const promise = execute();
        _inflight.set(endpoint, promise);
        void promise.finally(() => {
            // Do not let an older forced/renewed request remove a newer one.
            if (_inflight.get(endpoint) === promise) _inflight.delete(endpoint);
        }).catch(() => {});
        return promise;
    }

    // Writes are never cached. Preserve exact-path invalidation for every
    // successful HTTP mutation, then clear the inventory and its derived data
    // only after a successful inventory domain mutation. Barcode checks are
    // read-only POSTs and therefore do not evict inventory reads.
    const result = await execute();
    _clearRelatedCache(endpoint);
    if (_isSuccessfulInventoryMutation(endpoint, result)) _invalidateInventoryCaches();
    return result;
}

/**
 * Like request(), but a 401 response throws silently without wiping the session.
 * Use for background polling jobs where a transient 401 should not log the user out.
 */
async function backgroundRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return request<T>(endpoint, options, true);
}

// Export request helpers
export { request, backgroundRequest };

// API Service methods
export const apiService = {
    // Dashboard Stats
    async getStats(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any>(`/stats${query}`);
        } catch (error) {
            console.error('API Error getStats:', error);
            // For development, allow mock stats
            // return {
            //     sales: 12,
            //     inventory: 156,
            //     lowStock: 8,
            //     expiring: 3,
            // };
            throw error;
        }
    },

    // Pharmacovigilance Alerts
    async checkPharmacovigilance(scientificNames: string[], patientId?: string) {
        try {
            const res = await request<{
                interactions: Array<{ drug1: string; drug2: string; severity: string; description: string }>;
                allergyWarnings: string[];
            }>('/pos/alerts', {
                method: 'POST',
                body: JSON.stringify({ scientificNames, patientId })
            });
            return { interactions: res?.interactions ?? [], allergyWarnings: res?.allergyWarnings ?? [], failed: false };
        } catch (error) {
            console.error('API Error checkPharmacovigilance:', error);
            // A failed check is NOT "no interactions" — callers must surface it.
            return { interactions: [], allergyWarnings: [], failed: true };
        }
    },

    // Inventory
    async getDrugCurrentStock(drugId: string, branchId?: string): Promise<number | null> {
        try {
            const params = new URLSearchParams({ drugId });
            if (branchId) params.set('branchId', branchId);
            const result = await request<any[]>(`/inventory?${params.toString()}`);
            if (!result || result.length === 0) return 0;
            return result[0].quantity ?? 0;
        } catch {
            return null;
        }
    },

    async getInventory(branchId?: string, forceRefresh = false) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/inventory${query}`, {}, false, { forceRefresh });
        } catch (error) {
            console.error('API Error getInventory:', error);
            // For development, allow mock inventory
            // return [
            //     { id: '1', drugName: 'باراسيتامول 500mg', quantity: 150, price: 2.50, reorderLevel: 20 },
            //     { id: '2', drugName: 'أموكسيسيلين 250mg', quantity: 75, price: 8.00, reorderLevel: 30 },
            //     { id: '3', drugName: 'إيبوبروفين 400mg', quantity: 10, price: 5.00, reorderLevel: 25 },
            //     { id: '4', drugName: 'أوميبرازول 20mg', quantity: 0, price: 12.00, reorderLevel: 15 },
            //     { id: '5', drugName: 'ميتفورمين 500mg', quantity: 200, price: 6.50, reorderLevel: 40 },
            // ];
            throw error;
        }
    },

    async getInventoryPage(options: {
        branchId?: string; page: number; search: string; status: string;
        sort: string; direction: 'asc' | 'desc';
    }, forceRefresh = false) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options)) {
            if (value !== undefined) params.set(key, String(value));
        }
        return request<{
            items: any[]; page: number; hasMore: boolean; total: number; totalValue: number;
            counts: Record<'all' | 'low-stock' | 'out' | 'near-expiry' | 'expired', number>;
        }>(`/inventory/page?${params}`, {}, false, { forceRefresh });
    },

    // Get drug by barcode — uses POST /inventory/check-barcode
    async getDrugByBarcode(barcode: string, branchId?: string) {
        try {
            const result = await request<any>(`/inventory/check-barcode`, {
                method: 'POST',
                body: JSON.stringify({ barcode, branchId }),
            });
            if (result && result.exists && result.drug) {
                return {
                    id: result.drug.id,
                    barcode: result.drug.barcode,
                    name: result.drug.tradeName,
                    tradeName: result.drug.tradeName,
                    scientificName: result.drug.scientificName ?? '',
                    price: result.inventory?.price ?? 0,
                    publicPrice: result.inventory?.price ?? 0,
                    quantity: result.inventory?.quantity ?? 0,
                };
            }
            return null;
        } catch (error) {
            console.error('API Error getDrugByBarcode:', error);
            return null;
        }
    },

    // Search drugs by name — uses GET /inventory?search=...
    async searchDrugByName(query: string, branchId?: string): Promise<Array<{
        id: string; name: string; tradeName: string; scientificName: string;
        barcode: string; price: number; quantity: number;
    }>> {
        try {
            const params = new URLSearchParams({ search: query });
            if (branchId) params.set('branchId', branchId);
            const results = await request<any[]>(`/inventory?${params.toString()}`);
            return Array.isArray(results) ? results.map((r: any) => ({
                id:             r.drugId ?? r.id,
                name:           r.tradeName ?? r.drugName ?? '',
                tradeName:      r.tradeName ?? r.drugName ?? '',
                scientificName: r.scientificName ?? '',
                barcode:        r.barcode ?? '',
                price:          r.price ?? 0,
                quantity:       r.quantity ?? 0,
            })) : [];
        } catch (error) {
            console.error('API Error searchDrugByName:', error);
            return [];
        }
    },

    // Raw barcode check for full Add Inventory Flow
    async checkBarcodeExact(barcode: string, branchId?: string) {
        try {
            return await request<any>(`/inventory/check-barcode`, {
                method: 'POST',
                body: JSON.stringify({ barcode, branchId }),
            });
        } catch (error) {
            console.error('API Error checkBarcodeExact:', error);
            return { success: false, message: 'Server error' };
        }
    },

    // Add Batch (Drug exists in Branch Inventory)
    async addBatch(data: {
        inventoryId: string;
        batchNumber?: string;
        quantity: number;
        expiryDate: string;
        price?: number;
        costPrice?: number;
        supplierId?: string | null;
        /** ميزة وحدة التسعير: عدد الأشرطة في الباكيت — يُثبّت على الدواء ومشترك بين كل الصيدليات. */
        unitsPerPack?: number | null;
    }) {
        try {
            return await request<any>(`/inventory/add-batch`, {
                method: 'POST',
                headers: { 'x-idempotency-key': Date.now().toString(36) + Math.random().toString(36).substring(2) },
                body: JSON.stringify(data),
            });
        } catch (error) {
            console.error('API Error addBatch:', error);
            return { success: false, message: 'Server error' };
        }
    },

    // Add to Branch (Drug exists Globally, but not in Branch)
    async addToBranch(data: {
        drugId: string;
        branchId: string;
        price: number;
        cost: number;
        minStock: number;
        maxStock: number;
        batchNumber?: string;
        quantity: number;
        expiryDate: string;
        supplierId?: string | null;
        /** ميزة وحدة التسعير: عدد الأشرطة في الباكيت — يُثبّت على الدواء ومشترك بين كل الصيدليات. */
        unitsPerPack?: number | null;
    }) {
        try {
            return await request<any>(`/inventory/add-to-branch`, {
                method: 'POST',
                headers: { 'x-idempotency-key': Date.now().toString(36) + Math.random().toString(36).substring(2) },
                body: JSON.stringify(data),
            });
        } catch (error) {
            console.error('API Error addToBranch:', error);
            return { success: false, message: 'Server error' };
        }
    },

    // Create New Drug (Completely new Barcode)
    async createQuickDrug(data: {
        barcode: string;
        tradeName: string;
        scientificName: string;
        drugType: string;
        dosage: string;
        unit: string;
        category: string;
        manufacturer: string;
        country: string;
        branchId: string;
        price: number;
        costPrice: number;
        minStock: number;
        maxStock: number;
        batchNumber: string;
        quantity: number;
        expiryDate: string;
        supplierId?: string | null;
        isQuickSale?: boolean;
        /** ميزة وحدة التسعير: عدد الأشرطة في الباكيت — يُثبّت على الدواء ومشترك بين كل الصيدليات. */
        unitsPerPack?: number | null;
    }) {
        try {
            return await request<any>(`/inventory/create-quick`, {
                method: 'POST',
                headers: { 'x-idempotency-key': Date.now().toString(36) + Math.random().toString(36).substring(2) },
                body: JSON.stringify(data),
            });
        } catch (error) {
            console.error('API Error createQuickDrug:', error);
            return { success: false, message: 'Server error' };
        }
    },

    // Toggle quick-sale flag for a drug
    async toggleQuickSale(drugId: string, isQuickSale: boolean) {
        try {
            return await request<any>('/inventory/quick-sale', {
                method: 'PATCH',
                body: JSON.stringify({ drugId, isQuickSale }),
            });
        } catch (error) {
            console.error('API Error toggleQuickSale:', error);
            return { success: false, message: 'Server error' };
        }
    },

    // Create sale. `idempotencyKey` must be minted once per checkout attempt by
    // the caller and reused on every retry / offline replay of that same sale.
    async createSale(
        saleData: {
            items: any[];
            totalAmount: number;
            patientId?: string | null;
            paymentMethod?: 'CASH' | 'CARD' | 'CREDIT';
            discount?: number;
            branchId?: string | null;
        },
        idempotencyKey: string = newIdempotencyKey(),
    ) {
        try {
            return await request<{ success: boolean; sale?: { id: string; invoiceNumber?: number | null }; ack?: { status: string } }>('/sales', {
                method: 'POST',
                headers: { 'x-idempotency-key': idempotencyKey },
                body: JSON.stringify(saleData),
            });
        } catch (error) {
            console.error('API Error createSale:', error);
            throw error;
        }
    },

    // Get sales
    async getSales() {
        try {
            return await request('/sales');
        } catch (error) {
            console.error('API Error getSales:', error);
            return [];
        }
    },

    // Get alerts
    async getAlerts(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/alerts${query}`);
        } catch (error) {
            console.error('API Error getAlerts:', error);
            return [];
        }
    },

    // Get Smart Orders
    async getSmartOrders(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/smart-order${query}`);
        } catch (error) {
            console.error('API Error getSmartOrders:', error);
            return [];
        }
    },

    // Get Suppliers
    async getSuppliers(): Promise<Array<{ id: string; name: string; phone?: string }>> {
        try {
            return await request<Array<{ id: string; name: string; phone?: string }>>('/suppliers');
        } catch (error) {
            console.error('API Error getSuppliers:', error);
            return [];
        }
    },

    // Get Purchases List
    async getPurchases(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/purchases${query}`);
        } catch (error) {
            console.error('API Error getPurchases:', error);
            return [];
        }
    },

    // Create Purchase
    async createPurchase(data: { branchId: string; supplierId: string; items: any[] }) {
        try {
            return await request('/purchases/create', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } catch (error) {
            console.error('API Error createPurchase:', error);
            throw error;
        }
    },

    // Get Purchase Details
    async getPurchaseDetails(id: string) {
        try {
            return await request(`/purchases/${id}`);
        } catch (error) {
            console.error('API Error getPurchaseDetails:', error);
            throw error;
        }
    },

    // Cancel Purchase
    async cancelPurchase(id: string) {
        try {
            return await request(`/purchases/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ action: 'cancel' }),
            });
        } catch (error) {
            console.error('API Error cancelPurchase:', error);
            throw error;
        }
    },

    // Delete Purchase
    async deletePurchase(id: string) {
        try {
            return await request(`/purchases/${id}`, { method: 'DELETE' });
        } catch (error) {
            console.error('API Error deletePurchase:', error);
            throw error;
        }
    },

    // Receive Purchase
    async receivePurchase(id: string, items: any[]) {
        try {
            return await request(`/purchases/${id}/receive`, {
                method: 'POST',
                body: JSON.stringify({ items }),
            });
        } catch (error) {
            console.error('API Error receivePurchase:', error);
            throw error;
        }
    },

    // Get Reports (Sales)
    async getReports(period: 'daily' | 'weekly' | 'monthly' = 'daily', branchId?: string) {
        try {
            const query = branchId ? `&branchId=${branchId}` : '';
            return await request<any>(`/reports/sales?period=${period}${query}`);
        } catch (error) {
            console.error('API Error getReports:', error);
            return { sales: [], summary: { total: 0, count: 0 } };
        }
    },

    // Get Branches (cached for 5 minutes to avoid redundant network calls)
    async getBranches() {
        const now = Date.now();
        if (_branchCache && now - _branchCacheTs < 5 * 60 * 1000) return _branchCache;
        try {
            const data = await request<any[]>('/branches');
            _branchCache = data;
            _branchCacheTs = now;
            return data;
        } catch (error) {
            console.error('API Error getBranches:', error);
            return _branchCache ?? [];
        }
    },

    // Low-stock items that need ordering (stock ≤ minStock, no pending order)
    async getLowStockItems(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/purchases/low-stock${query}`);
        } catch (error) {
            console.error('API Error getLowStockItems:', error);
            return [];
        }
    },

    // Get Debts
    async getDebts(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/debts${query}`);
        } catch (error) {
            console.error('API Error getDebts:', error);
            return [];
        }
    },

    // Get Debtor Details
    async getDebtorDetails(id: string) {
        try {
            return await request<any>(`/debts/${id}`);
        } catch (error) {
            console.error('API Error getDebtorDetails:', error);
            throw error;
        }
    },

    // Pay Debt — Fix #6: تصحيح اسم المعامل ليتطابق مع السيرفر + إضافة الملاحظة
    async payDebt(patientId: string, amount: number, note?: string) {
        try {
            return await request('/debts/pay', {
                method: 'POST',
                body: JSON.stringify({ patientId, amount, note }),
            });
        } catch (error) {
            console.error('API Error payDebt:', error);
            throw error;
        }
    },

    // Loyalty
    async getLoyaltySettings() {
        try {
            return await request<{
                loyaltyEnabled: boolean;
                loyaltyPointsPerDinar: number;
                loyaltyRedemptionValue: number;
                loyaltyMinRedemption: number;
            }>('/loyalty');
        } catch { return null; }
    },

    async getLoyaltyAccount(patientId: string) {
        try {
            const res = await request<{ account: any }>(`/loyalty/account?patientId=${patientId}`);
            return (res as any)?.account ?? null;
        } catch { return null; }
    },

    async redeemLoyaltyPoints(patientId: string, points: number) {
        return await request<{ redeemed: number; discountAmount: number; remainingPoints: number }>(
            '/loyalty/redeem', { method: 'POST', body: JSON.stringify({ patientId, points }) }
        );
    },

    async earnLoyaltyPoints(patientId: string, saleId: string | null, amount: number) {
        try {
            await request('/loyalty/earn', {
                method: 'POST',
                body: JSON.stringify({ patientId, saleId, amount }),
            });
        } catch { /* silent — earning is best-effort */ }
    },

    // Search Patients
    async searchPatients(query: string) {
        try {
            return await request<any[]>(`/patients?query=${encodeURIComponent(query)}`);
        } catch (error) {
            console.error('API Error searchPatients:', error);
            return [];
        }
    },

    // Get Patients (Recent/All)
    async getPatients(branchId?: string) {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            return await request<any[]>(`/patients${query}`);
        } catch (error) {
            console.error('API Error getPatients:', error);
            return [];
        }
    },

    // AI OCR Prescription Scanning
    async scanPrescription(base64Image: string) {
        try {
            const baseUrl = await getBaseUrl();
            const token = await SecureStore.getItemAsync('authToken') || await AsyncStorage.getItem('authToken');

            const response = await fetch(`${baseUrl}/scan/prescription`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: base64Image }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'فشل في تحليل الوصفة');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error scanPrescription:', error);
            throw error;
        }
    },

    async getScanUsage(): Promise<{ limit: number; used: number; remaining: number }> {
        try {
            return await request<any>('/scan/usage');
        } catch {
            return { limit: 20, used: 0, remaining: 20 };
        }
    },

    // Get Loyalty Info for current branch
    async getLoyaltyInfo() {
        try {
            return await request<any>('/loyalty');
        } catch (error) {
            console.error('API Error getLoyaltyInfo:', error);
            return null;
        }
    }
};
