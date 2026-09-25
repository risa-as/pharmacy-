export function formatIQD(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount) + " د.ع";
}

/**
 * Short, stable reference for a sale that has no cloud invoice number yet: the
 * first 12 hex characters of its id (48 bits, so two sales of one organisation
 * sharing it is very unlikely; the searches still list every match). It never
 * changes, so a receipt printed before sync still leads to its sale.
 */
export function localSaleRef(saleId: string): string {
    return "م-" + saleId.replace(/-/g, "").slice(0, 12).toUpperCase();
}

/** The number to print or show for a sale: the cloud number, else the local reference. */
export function saleLabel(sale: { id: string; invoiceNumber?: string | number | null }): string {
    return sale.invoiceNumber ? String(sale.invoiceNumber) : localSaleRef(sale.id);
}

export function ipcInvoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    return Promise.race([
        window.ipcRenderer.invoke(channel, ...args) as Promise<T>,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`IPC timeout (${channel})`)), 12000)
        ),
    ]);
}

// ─── Held Invoices (تعليق الفاتورة) ──────────────────────────────────────────
// تُحفظ في localStorage لتبقى بعد إغلاق التطبيق، ومنفصلة لكل مستخدم.
import type { HeldInvoice } from "./pos-types";

const HELD_INVOICES_KEY = (userId: string) => `faramace:held-invoices:${userId || "default"}`;

export function loadHeldInvoices(userId: string): HeldInvoice[] {
    try {
        const raw = localStorage.getItem(HELD_INVOICES_KEY(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveHeldInvoices(userId: string, list: HeldInvoice[]): void {
    try {
        localStorage.setItem(HELD_INVOICES_KEY(userId), JSON.stringify(list));
    } catch (e) {
        console.error("فشل حفظ الفواتير المعلّقة", e);
    }
}

export function getExpiryStatus(
    expiryDate: string | null | undefined
): { label: string; color: string; urgent: boolean } | null {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { label: 'منتهي', color: 'bg-destructive text-destructive-foreground', urgent: true };
    if (diffDays <= 90) return { label: `${diffDays} يوم`, color: 'bg-destructive/10 text-destructive', urgent: true };
    if (diffDays <= 180) return { label: `${Math.ceil(diffDays / 30)} شهر`, color: 'bg-warning/10 text-warning', urgent: false };
    return null;
}
