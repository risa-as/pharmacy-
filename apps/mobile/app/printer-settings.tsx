import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { printerService } from '../services/printer';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { usePalette, Surface, SectionTitle, AppButton, InfoNote } from '../components/ui/Kit';

interface PrinterDevice { deviceName: string; macAddress: string }

type Phase = 'idle' | 'searching' | 'connecting' | 'failed';

/**
 * Printer setup (design printer.png): explicit searching / connected / failed
 * states and no fake connection. When the build has printing disabled the
 * screen says so and every action stays disabled.
 */
export default function PrinterSettingsScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const supported = printerService.isSupported();
    const [devices, setDevices] = useState<PrinterDevice[]>([]);
    const [phase, setPhase] = useState<Phase>('idle');
    const [connected, setConnected] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const search = useCallback(async () => {
        if (!supported) return;
        setPhase('searching');
        setMessage(null);
        try {
            setDevices(await printerService.getDeviceList());
            setPhase('idle');
        } catch {
            setPhase('failed');
            setMessage('فشل البحث عن الطابعات. تأكد من تشغيل البلوتوث والطابعة.');
        }
    }, [supported]);

    useEffect(() => {
        (async () => {
            await printerService.init();
            setConnected(await printerService.getSavedPrinter());
            if (supported) search();
        })();
    }, [search, supported]);

    const connect = async (device: PrinterDevice) => {
        setPhase('connecting');
        setMessage(null);
        const ok = await printerService.connectPrinter(device.macAddress).catch(() => false);
        if (ok) { setConnected(device.macAddress); setPhase('idle'); }
        else { setPhase('failed'); setMessage(`تعذّر الاتصال بـ ${device.deviceName || 'الطابعة'}.`); }
    };

    const connectedDevice = devices.find(d => d.macAddress === connected);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="إعداد الطابعة" fallbackHref="/(tabs)/settings" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
                {!supported && (
                    <InfoNote tone="warning" title="الطباعة غير متاحة في هذا الإصدار" text="طباعة الفواتير الحرارية معطّلة مؤقتاً في هذه النسخة من التطبيق. البيع يعمل بشكل طبيعي دون طباعة." />
                )}

                <Surface style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: connected ? C.successBg : C.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="print-outline" size={38} color={connected ? C.success : C.danger} />
                    </View>
                    <Text style={{ color: connected ? C.success : C.danger, fontSize: 18, fontWeight: '900' }}>
                        {connected ? 'الطابعة متصلة' : 'الطابعة غير متصلة'}
                    </Text>
                    <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'center' }}>
                        {connected ? (connectedDevice?.deviceName ?? connected) : 'شغّل الطابعة وتحقق من اتصال البلوتوث.'}
                    </Text>
                    <AppButton
                        label={phase === 'searching' ? 'جارِ البحث…' : 'البحث عن طابعات'}
                        icon="search-outline"
                        loading={phase === 'searching'}
                        disabled={!supported || phase === 'connecting'}
                        onPress={search}
                        style={{ alignSelf: 'stretch' }}
                    />
                    {message ? <Text style={{ color: C.danger, fontSize: 13, textAlign: 'center' }}>{message}</Text> : null}
                </Surface>

                <View>
                    <SectionTitle title="الأجهزة المتاحة" />
                    <Surface style={{ gap: 10 }}>
                        {phase === 'searching' ? (
                            <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
                        ) : devices.length === 0 ? (
                            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}>
                                <Ionicons name="print-outline" size={36} color={C.mutedForeground} />
                                <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>لم يتم العثور على أجهزة</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{supported ? 'تأكد أن الطابعة قريبة وقابلة للاكتشاف.' : 'البحث غير متاح في هذا الإصدار.'}</Text>
                            </View>
                        ) : devices.map(d => {
                            const isConnected = d.macAddress === connected;
                            return (
                                <TouchableOpacity
                                    key={d.macAddress}
                                    onPress={() => connect(d)}
                                    disabled={phase === 'connecting'}
                                    style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10 }}
                                >
                                    <Ionicons name="print-outline" size={22} color={isConnected ? C.success : C.foreground} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'right' }}>{d.deviceName || 'جهاز غير معروف'}</Text>
                                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>{d.macAddress}</Text>
                                    </View>
                                    {isConnected ? <Ionicons name="checkmark-circle" size={22} color={C.success} /> : <Text style={{ color: C.primary, fontWeight: '700' }}>اتصال</Text>}
                                </TouchableOpacity>
                            );
                        })}
                        <AppButton
                            label="طباعة تجريبية"
                            icon="receipt-outline"
                            variant="outline"
                            disabled={!supported || !connected}
                            onPress={() => printerService.printReceipt('Faramace', [{ name: 'اختبار', quantity: 1, price: 0 }], 0)}
                        />
                    </Surface>
                </View>
            </ScrollView>
        </View>
    );
}
