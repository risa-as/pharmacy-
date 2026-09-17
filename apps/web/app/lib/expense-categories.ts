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
