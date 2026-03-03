/**
 * Desktop Currency Utility
 * 
 * Supports IQD and USD for desktop application.
 */

export type CurrencyCode = 'IQD' | 'USD';

interface CurrencyConfig {
    code: CurrencyCode;
    symbol: string;
    decimals: number;
    locale: string;
}

// Default to IQD until settings are loaded
let currentCurrency: CurrencyConfig = {
    code: 'IQD',
    symbol: 'د.ع',
    decimals: 0,
    locale: 'ar-IQ'
};

export function setAppCurrency(code: string) {
    if (code === 'USD') {
        currentCurrency = {
            code: 'USD',
            symbol: '$',
            decimals: 2,
            locale: 'en-US'
        };
    } else {
        currentCurrency = {
            code: 'IQD',
            symbol: 'د.ع',
            decimals: 0,
            locale: 'ar-IQ'
        };
    }
}

export function formatCurrency(amount: number): string {
    const formatted = new Intl.NumberFormat(currentCurrency.locale, {
        minimumFractionDigits: currentCurrency.decimals,
        maximumFractionDigits: currentCurrency.decimals,
    }).format(amount);

    if (currentCurrency.code === 'USD') {
        return `${currentCurrency.symbol}${formatted}`;
    }
    return `${formatted} ${currentCurrency.symbol}`;
}

export function getCurrencySymbol(): string {
    return currentCurrency.symbol;
}
