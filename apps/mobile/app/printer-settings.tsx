import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { printerService } from '../services/printer';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';

interface PrinterDevice {
    deviceName: string;
    macAddress: string;
}

export default function PrinterSettingsScreen() {
    const [devices, setDevices] = useState<PrinterDevice[]>([]);
    const [scanning, setScanning] = useState(false);
    const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => { setup(); }, []);

    const setup = async () => {
        await printerService.init();
        const saved = await printerService.getSavedPrinter();
        setConnectedAddress(saved);
        scanDevices();
    };

    const scanDevices = async () => {
        setScanning(true);
        try {
            const list = await printerService.getDeviceList();
            setDevices(list);
        } catch {
            Alert.alert('خطأ', 'فشل البحث عن الطابعات');
        } finally {
            setScanning(false);
        }
    };

    const connect = async (device: PrinterDevice) => {
        setScanning(true);
        try {
            const success = await printerService.connectPrinter(device.macAddress);
            if (success) {
                setConnectedAddress(device.macAddress);
                Alert.alert('نجاح', `تم الاتصال بالطابعة ${device.deviceName}`);
            } else {
                Alert.alert('خطأ', 'فشل الاتصال بالطابعة');
            }
        } catch {
            Alert.alert('خطأ', 'حدث خطأ أثناء الاتصال');
        } finally {
            setScanning(false);
        }
    };

    const testPrint = async () => {
        if (!connectedAddress) {
            Alert.alert('تنبيه', 'يرجى الاتصال بطابعة أولاً');
            return;
        }
        await printerService.printReceipt('Faramace Test', [
            { name: 'Item 1', quantity: 1, price: 1000 },
            { name: 'Item 2', quantity: 2, price: 500 },
        ], 2000);
    };

    const renderItem = ({ item }: { item: PrinterDevice }) => {
        const isConnected = item.macAddress === connectedAddress;
        return (
            <TouchableOpacity
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isConnected ? C.primary : C.card,
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: isConnected ? C.primary : C.border,
                }}
                onPress={() => connect(item)}
                activeOpacity={0.7}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="print-outline" size={24} color={isConnected ? '#fff' : C.foreground} />
                    <View>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: isConnected ? '#fff' : C.foreground, textAlign: 'right' }}>
                            {item.deviceName || 'Unknown Device'}
                        </Text>
                        <Text style={{ fontSize: 12, color: isConnected ? 'rgba(255,255,255,0.8)' : C.mutedForeground, textAlign: 'right' }}>
                            {item.macAddress}
                        </Text>
                    </View>
                </View>
                {isConnected && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', padding: 20, paddingTop: 60 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-back" size={24} color={C.foreground} />
                </TouchableOpacity>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: C.foreground, marginLeft: 16 }}>
                    إعدادات الطابعة
                </Text>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row-reverse', paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
                <TouchableOpacity
                    style={{
                        flex: 1, backgroundColor: C.primary,
                        flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                        padding: 12, borderRadius: 12, gap: 8,
                        opacity: scanning ? 0.7 : 1,
                    }}
                    onPress={scanDevices}
                    disabled={scanning}
                    activeOpacity={0.8}
                >
                    {scanning
                        ? <ActivityIndicator color="#fff" />
                        : <><Ionicons name="refresh" size={20} color="#fff" /><Text style={{ color: '#fff', fontWeight: 'bold' }}>بحث عن أجهزة</Text></>
                    }
                </TouchableOpacity>

                <TouchableOpacity
                    style={{
                        flex: 1, backgroundColor: connectedAddress ? C.success : C.border,
                        flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
                        padding: 12, borderRadius: 12, gap: 8,
                        opacity: connectedAddress ? 1 : 0.6,
                    }}
                    onPress={testPrint}
                    disabled={!connectedAddress}
                    activeOpacity={0.8}
                >
                    <Ionicons name="receipt-outline" size={20} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>طباعة تجريبية</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={devices}
                renderItem={renderItem}
                keyExtractor={item => item.macAddress}
                contentContainerStyle={{ padding: 20, paddingTop: 0 }}
                ListEmptyComponent={
                    <Text style={{ textAlign: 'center', marginTop: 40, color: C.mutedForeground, fontSize: 15 }}>
                        {scanning ? 'جاري البحث...' : 'لم يتم العثور على طابعات'}
                    </Text>
                }
            />
        </View>
    );
}
