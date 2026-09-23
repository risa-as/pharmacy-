'use client';

// Keep the operation key through network failures and page reloads. A successful
// response ends this operation so a later intentional equal payment gets a new key.
const pending = new Map<string, string>();
export async function warehouseMutation(url: string, init: RequestInit): Promise<Response> {
    const body = JSON.parse(String(init.body ?? '{}'));
    const fingerprint = JSON.stringify([url, init.method ?? 'POST', body]);
    // getRandomValues is also available on an HTTP LAN origin; subtle/randomUUID
    // may be absent there. The storage key is a lookup key, not a security hash.
    const slot = 'warehouse-pending:' + fingerprint;
    let key = pending.get(slot);
    try { key ??= sessionStorage.getItem(slot) ?? undefined; } catch { /* memory fallback */ }
    key ??= Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    pending.set(slot, key);
    try { sessionStorage.setItem(slot, key); } catch { /* memory fallback */ }
    const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, idempotencyKey: key }) });
    if (response.ok) {
        // Losing the body after headers arrived is still an ambiguous outcome.
        // Do not retire the key until the complete JSON result has arrived.
        await response.clone().json();
        pending.delete(slot);
        try { sessionStorage.removeItem(slot); } catch { /* memory fallback */ }
    }
    return response;
}
