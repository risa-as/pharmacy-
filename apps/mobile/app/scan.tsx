import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiService } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

interface DrugResult {
    id: string;
    name: string;
    scientificName?: string;
    price: number;
    quantity: number;
    reorderLevel: number;
}

export default function ScanScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [drugResult, setDrugResult] = useState<DrugResult | null>(null);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const params = useLocalSearchParams();
    const fromScreen = params.from as string | undefined;

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: '#000' }} />;
    }

    if (!permission.granted) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: 24, marginBottom: 20 }}>
                    <Ionicons name="camera-outline" size={56} color="#fff" />
                </View>
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 8, fontWeight: '700' }}>
                    إذن الكاميرا مطلوب
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 14, marginBottom: 28 }}>
                    نحتاج إذن الكاميرا لمسح الباركود
                </Text>
                <TouchableOpacity
                    onPress={requestPermission}
                    style={{ backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>منح الإذن</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
        if (scanned || loading) return;
        setScanned(true);

        // Inventory flow: navigate back immediately with barcode param
        if (fromScreen === 'inventory') {
            router.replace({ pathname: '/(tabs)/inventory', params: { scannedBarcode: data } });
            return;
        }

        // Sales flow: navigate back with barcode param for cart lookup
        if (fromScreen === 'sales') {
            router.replace({ pathname: '/(tabs)/sales', params: { scannedBarcode: data } });
            return;
        }

        // Standalone flow: look up drug and show result card
        setLoading(true);
        try {
            const res = await apiService.checkBarcodeExact(data);
            if (res.success && res.exists && (res.inventory || res.drug)) {
                const src = res.inventory ?? res.drug;
                setDrugResult({
                    id: src.id,
                    name: src.drug?.tradeName ?? src.tradeName ?? src.drugName ?? data,
                    scientificName: src.drug?.scientificName ?? src.scientificName,
                    price: src.price ?? 0,
                    quantity: src.quantity ?? 0,
                    reorderLevel: src.reorderLevel ?? 0,
                });
            } else {
                Alert.alert(
                    'غير موجود',
                    `الباركود: ${data}\nلم يتم العثور على هذا المنتج في النظام`,
                );
                setScanned(false);
            }
        } catch {
            Alert.alert('خطأ', 'فشل البحث عن المنتج. تحقق من الاتصال وأعد المحاولة.');
            setScanned(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToCart = () => {
        if (!drugResult) return;
        router.replace({
            pathname: '/(tabs)/sales',
            params: { scannedBarcode: drugResult.id },
        });
    };

    const handleReset = () => {
        setScanned(false);
        setDrugResult(null);
    };

    const stockVariant = drugResult
        ? (drugResult.quantity === 0 ? 'danger' as const : drugResult.quantity <= drugResult.reorderLevel ? 'warning' as const : 'success' as const)
        : 'info' as const;

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Camera fills entire screen */}
            <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_e', 'code128', 'code39'],
                }}
            />

            {/* Header overlay */}
            <View style={{
                position: 'absolute', top: Platform.OS === 'ios' ? 56 : 40, left: 0, right: 0,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingVertical: 12,
                backgroundColor: 'rgba(0,0,0,0.55)',
            }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>مسح الباركود</Text>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 8 }}
                >
                    <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Scan frame + instruction (shown while scanning) */}
            {!drugResult && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{
                        width: 240, height: 240,
                        borderWidth: 3, borderColor: C.primary, borderRadius: 18,
                        backgroundColor: 'transparent',
                    }} />
                    <Text style={{
                        color: '#fff', marginTop: 24, fontSize: 14, fontWeight: '600',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
                    }}>
                        {loading ? 'جاري البحث...' : 'وجه الكاميرا نحو الباركود'}
                    </Text>
                    {loading && (
                        <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 16 }} />
                    )}
                </View>
            )}

            {/* Drug result bottom sheet */}
            {drugResult && (
                <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: C.card,
                    borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28,
                }}>
                    {/* Drug header */}
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 18 }}>
                        <View style={{
                            backgroundColor: `${C.primary}18`, borderRadius: 16,
                            padding: 12, marginLeft: 14,
                        }}>
                            <Ionicons name="medkit" size={28} color={C.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 17, textAlign: 'right' }}>
                                {drugResult.name}
                            </Text>
                            {drugResult.scientificName && (
                                <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                                    {drugResult.scientificName}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Price + Stock stats */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 20 }}>
                        <View style={{ flex: 1, backgroundColor: C.background, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 6 }}>السعر</Text>
                            <Text style={{ color: C.primary, fontWeight: '900', fontSize: 18 }}>
                                {drugResult.price.toLocaleString()}
                            </Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 2 }}>د.ع</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: C.background, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 6 }}>المخزون</Text>
                            <Badge label={String(drugResult.quantity)} variant={stockVariant} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11, marginTop: 6 }}>
                                حد الطلب: {drugResult.reorderLevel}
                            </Text>
                        </View>
                    </View>

                    {/* Action buttons side by side */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Button label="إضافة للسلة" onPress={handleAddToCart} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button label="مسح مرة أخرى" variant="secondary" onPress={handleReset} />
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}
