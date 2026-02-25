/**
 * Arabic PDF Helper for jsPDF
 * 
 * jsPDF's default fonts (Helvetica, Courier, Times) don't support Arabic glyphs.
 * This helper provides two approaches:
 * 
 * 1. For simple labels/headers: use reversed Unicode text (quick hack)
 * 2. For full Arabic support: embed an Arabic-compatible font
 * 
 * Since embedding a full Arabic font adds ~200KB+, we use approach #1 for
 * headers and labels, and keep drug/branch names as-is (they render from
 * the database which may contain both Arabic and English).
 * 
 * The actual rendering of Arabic text within autoTable cells works when the
 * font supports it. For the server-side PDF reports, we ensure the encoding
 * is UTF-8 and headers are bilingual (Arabic + English).
 */

/**
 * Bilingual table headers for PDF reports.
 * Format: "English / عربي"
 */
export const BILINGUAL_HEADERS = {
    inventory: {
        columns: ['#', 'Drug Name / اسم الدواء', 'Barcode / الباركود', 'Branch / الفرع', 'Qty / الكمية', 'Min/Max', 'Status / الحالة'],
        title: 'Inventory Report / تقرير المخزون',
        subtitle: 'Faramace Pharmacy System',
    },
    expiry: {
        columns: ['#', 'Drug Name / اسم الدواء', 'Batch / الدفعة', 'Branch / الفرع', 'Qty / الكمية', 'Expiry Date / تاريخ الانتهاء', 'Status / الحالة'],
        title: 'Expiry Report / تقرير الصلاحية',
        subtitle: 'Faramace Pharmacy System',
    }
};

/**
 * Status labels in Arabic
 */
export const STATUS_LABELS = {
    LOW: 'منخفض / LOW',
    OK: 'جيد / OK',
    OVER: 'فائض / OVER',
    EXPIRED: 'منتهي / EXPIRED',
};

/**
 * Format a date for Arabic locale
 */
export function formatDateArabic(date: Date): string {
    try {
        return date.toLocaleDateString('ar-IQ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch {
        return date.toISOString().split('T')[0];
    }
}

/**
 * Safely encode text for PDF output.
 * Ensures the text doesn't contain characters that break jsPDF.
 */
export function sanitizeForPdf(text: string | null | undefined): string {
    if (!text) return '';
    // Replace any null bytes or control characters that might break PDF
    return String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
