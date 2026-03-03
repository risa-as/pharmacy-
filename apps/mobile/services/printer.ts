import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { BLEPrinter } from 'react-native-thermal-receipt-printer';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrinterDevice {
    deviceName: string;
    macAddress: string;
}

export const printerService = {
    // Initialize
    async init() {
        if (Platform.OS === 'android') {
            await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);
        }
        try {
            await BLEPrinter.init();
        } catch (err) {
            console.warn('Printer init error:', err);
        }
    },

    // Get Device List
    async getDeviceList(): Promise<PrinterDevice[]> {
        try {
            const list = await BLEPrinter.getDeviceList();
            // Map the result if necessary, or just cast if we are sure
            return list.map((d: any) => ({
                deviceName: d.deviceName || d.name || 'Unknown',
                macAddress: d.macAddress || d.address
            }));
        } catch (err) {
            console.error('Get device list error:', err);
            return [];
        }
    },

    // Connect
    async connectPrinter(address: string) {
        try {
            await BLEPrinter.connectPrinter(address);
            await AsyncStorage.setItem('printer_address', address);
            return true;
        } catch (err) {
            console.error('Connect error:', err);
            return false;
        }
    },

    // Get Saved Printer
    async getSavedPrinter(): Promise<string | null> {
        return await AsyncStorage.getItem('printer_address');
    },

    // Print Receipt
    async printReceipt(shopName: string, items: any[], total: number) {
        try {
            const date = new Date().toLocaleString();
            let receipt = `<C>${shopName}</C>\n`;
            receipt += `<C>--------------------------------</C>\n`;
            receipt += `<C>Date: ${date}</C>\n`;
            receipt += `<C>--------------------------------</C>\n`;

            items.forEach((item) => {
                // Formatting item line: Name ..... Price
                // A simple approach. For Arabic, alignment might be tricky on basic thermal printers 
                // without explicit Arabic font support in firmware. 
                // We'll assume standard support or print simplified.
                receipt += `<L>${item.name}</L>\n`;
                receipt += `<R>${item.quantity} x ${item.price} = ${item.quantity * item.price}</R>\n`;
            });

            receipt += `<C>--------------------------------</C>\n`;
            receipt += `<R>TOTAL: ${total}</R>\n`;
            receipt += `<C>--------------------------------</C>\n`;
            receipt += `<C>Thank you for visiting</C>\n\n\n`;

            await BLEPrinter.printBill(receipt);
        } catch (err) {
            console.error('Print error:', err);
            Alert.alert('خطأ للطباعة', 'تأكد من اتصال الطابعة');
        }
    }
};
