/**
 * Shared display formatters. Keep number formatting as the app already does
 * (grouped Latin digits) — navigation-map §12 forbids a blanket digit switch.
 */

/** 11000 → "11,000" */
export function formatNumber(n: number | null | undefined): string {
    const v = Number(n ?? 0);
    return (Number.isFinite(v) ? v : 0).toLocaleString('en-US');
}

/** Currency suffix used across the app. */
export const CURRENCY = 'د.ع';

/** 11000 → "11,000 د.ع" */
export function formatIQD(n: number | null | undefined): string {
    return `${formatNumber(n)} ${CURRENCY}`;
}

/**
 * Invoice label from one source: the per-organisation sequential number when
 * present, otherwise the first 8 chars of the id. No "INV-" prefix.
 */
export function formatInvoiceNumber(sale: { invoiceNumber?: number | null; id?: string | null }): string {
    if (sale.invoiceNumber != null) return `#${sale.invoiceNumber}`;
    return sale.id ? `#${sale.id.slice(0, 8).toUpperCase()}` : '#—';
}

/** Arabic label for a sale payment method. */
export function paymentMethodLabel(method: string | null | undefined): string {
    switch ((method ?? '').toUpperCase()) {
        case 'CREDIT': return 'آجل';
        case 'CARD': return 'بطاقة';
        case 'CASH':
        case '':
            return 'نقدي';
        default: return 'أخرى';
    }
}

/** Initials for text avatars: "مريض تجريبي" → "م ت" */
export function initials(name: string | null | undefined, max = 2): string {
    return (name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, max)
        .map(p => p.charAt(0).toUpperCase())
        .join(' ');
}
