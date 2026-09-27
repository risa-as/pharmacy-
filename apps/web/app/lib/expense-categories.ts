/**
 * Expense categories exist in two vocabularies in the database: the web forms
 * save Arabic text ("إيجار"), while the mobile app saves keys ("RENT"). Both are
 * valid rows, so every screen displays them through this map.
 */
const CATEGORY_LABELS: Record<string, string> = {
    RENT: 'إيجار',
    SALARY: 'رواتب',
    SALARIES: 'رواتب',
    UTILITIES: 'خدمات',
    SUPPLIES: 'مستلزمات',
    MAINTENANCE: 'صيانة',
    MARKETING: 'تسويق',
    MISC: 'نثرية',
    OTHER: 'أخرى',
};

/** Arabic label for a stored category; unknown values are shown as they are. */
export function expenseCategoryLabel(category: string | null | undefined): string {
    if (!category) return '—';
    return CATEGORY_LABELS[category.toUpperCase()] ?? category;
}

/**
 * Buying stock is not an operating expense: its cost is counted as cost of goods
 * sold when the goods are sold. Until 2026-09-27, receiving a purchase as paid
 * also recorded its amount as an expense in this category, so profit subtracted
 * the same cost twice. Profit calculations exclude it; the records are kept and
 * reported separately, never deleted.
 */
export const STOCK_PURCHASE_EXPENSE_CATEGORY = 'مشتريات بضاعة';

/** Prisma filter for expenses that reduce profit (category is never null). */
export const operatingExpenseWhere = { category: { not: STOCK_PURCHASE_EXPENSE_CATEGORY } };

/** Prisma filter for the legacy stock-purchase records, shown apart from expenses. */
export const stockPurchaseExpenseWhere = { category: STOCK_PURCHASE_EXPENSE_CATEGORY };
