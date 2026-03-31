/**
 * Currency Formatting Utility
 * 
 * Supports IQD (Iraqi Dinar) and USD (US Dollar).
 * Used across the entire application for consistent currency display.
 */

export type CurrencyCode = 'IQD' | 'USD';

const CURRENCY_CONFIG: Record<CurrencyCode, { symbol: string; label: string; locale: string; decimals: number }> = {
    IQD: { symbol: 'د.ع', label: 'دينار عراقي', locale: 'en-US', decimals: 0 },
    USD: { symbol: '$', label: 'دولار أمريكي', locale: 'en-US', decimals: 2 },
};

/**
 * Format a number as currency
 * @param amount - The numeric amount
 * @param currency - Currency code ('IQD' or 'USD'), defaults to 'IQD'
 * @returns Formatted string like "1,250,000 د.ع" or "$1,250.00"
 */
export function formatCurrency(amount: number, currency: CurrencyCode = 'IQD'): string {
    const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.IQD;

    const formatted = new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals,
    }).format(amount);

    if (currency === 'USD') {
        return `$${formatted}`;
    }
    return `${formatted} ${config.symbol}`;
}

/**
 * Get the currency symbol
 */
export function getCurrencySymbol(currency: CurrencyCode = 'IQD'): string {
    return CURRENCY_CONFIG[currency]?.symbol || 'د.ع';
}

/**
 * Get the currency label
 */
export function getCurrencyLabel(currency: CurrencyCode = 'IQD'): string {
    return CURRENCY_CONFIG[currency]?.label || 'دينار عراقي';
}

/**
 * Get all supported currencies for dropdown
 */
export function getSupportedCurrencies() {
    return Object.entries(CURRENCY_CONFIG).map(([code, config]: any) => ({
        code: code as CurrencyCode,
        symbol: config.symbol,
        label: config.label,
    }));
}
