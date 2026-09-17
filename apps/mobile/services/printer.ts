import { Alert } from 'react-native';

// BLE thermal printing is temporarily disabled — react-native-thermal-receipt-printer
// is incompatible with New Architecture (required by react-native-reanimated v4).
// Replace with a New-Arch-compatible library when available.

interface PrinterDevice {
    deviceName: string;
    macAddress: string;
}

export const printerService = {
    /** False while BLE printing is disabled in this build — UIs must say so instead of pretending. */
    isSupported(): boolean {
        return false;
    },

    async init() {
        // no-op
    },

    async getDeviceList(): Promise<PrinterDevice[]> {
        return [];
    },

    async connectPrinter(_address: string): Promise<boolean> {
        Alert.alert('الطابعة', 'خاصية الطباعة غير متاحة حالياً في هذا الإصدار');
        return false;
    },

    async getSavedPrinter(): Promise<string | null> {
        return null;
    },

    async printReceipt(_shopName: string, _items: any[], _total: number): Promise<void> {
        Alert.alert('الطابعة', 'خاصية الطباعة غير متاحة حالياً في هذا الإصدار');
    },
};
