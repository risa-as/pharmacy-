import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, Animated, Easing, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { apiService } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { managerPalette, Radius } from '../constants/colors';
import { Badge } from '../components/ui/Badge';

interface DrugResult {
    id: string;
    name: string;
    scientificName?: string;
    price: number;
    quantity: number;
    reorderLevel: number;
}

const FRAME = 250;

export default function ScanScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [drugResult, setDrugResult] = useState<DrugResult | null>(null);
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    const params = useLocalSearchParams();
    const fromScreen = params.from as string | undefined;

    // Animated scanning line
    const scanLine = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLine, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(scanLine, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        anim.start();
        return () => anim.stop();
    }, [scanLine]);

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: '#000' }} />;
    }

    if (!permission.granted) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={{ backgroundColor: `${C.primary}33`, borderRadius: 999, padding: 26, marginBottom: 22 }}>
                    <Ionicons name="camera-outline" size={56} color={C.primary} />
                </View>
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: 17, marginBottom: 8, fontWeight: '800' }}>
                    إذن الكاميرا مطلوب
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 14, marginBottom: 28 }}>
                    نحتاج إذن الكاميرا لمسح الباركود
                </Text>
                <TouchableOpacity
                    onPress={requestPermission}
                    activeOpacity={0.85}
                    style={{ backgroundColor: C.primary, borderRadius: Radius.sm, paddingHorizontal: 30, paddingVertical: 14 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>منح الإذن</Text>
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

        // Sales flow: hand the barcode off via storage and return to the EXISTING
        // sales screen with router.back so its in-progress cart is preserved.
        if (fromScreen === 'sales') {
            await AsyncStorage.setItem('pendingScanBarcode', data);
            router.back();
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

    // One corner bracket of the scan frame.
    const corner = (pos: { top?: number; bottom?: number; left?: number; right?: number }, radius: object) => (
        <View
            style={{
                position: 'absolute', width: 34, height: 34,
                borderColor: C.primary,
                borderTopWidth: pos.top !== undefined ? 4 : 0,
                borderBottomWidth: pos.bottom !== undefined ? 4 : 0,
                borderLeftWidth: pos.left !== undefined ? 4 : 0,
                borderRightWidth: pos.right !== undefined ? 4 : 0,
                ...pos, ...radius,
            }}
        />
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Stack.Screen options={{ headerShown: false }} />
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
            }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="barcode-outline" size={18} color="#fff" />
                    </View>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>مسح الباركود</Text>
                </View>
                <TouchableOpacity
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.xs, padding: 8 }}
                >
                    <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Spotlight overlay + scan frame (while scanning) */}
            {!drugResult && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    {/* Top dim */}
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />

                    {/* Middle row: left dim | window | right dim */}
                    <View style={{ flexDirection: 'row', height: FRAME }}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
                        <View style={{ width: FRAME, height: FRAME }}>
                            {corner({ top: 0, right: 0 }, { borderTopRightRadius: 14 })}
                            {corner({ top: 0, left: 0 }, { borderTopLeftRadius: 14 })}
                            {corner({ bottom: 0, right: 0 }, { borderBottomRightRadius: 14 })}
                            {corner({ bottom: 0, left: 0 }, { borderBottomLeftRadius: 14 })}
                            {/* Scanning line */}
                            <Animated.View
                                style={{
                                    position: 'absolute', left: 8, right: 8, height: 2.5, borderRadius: 2,
                                    backgroundColor: C.primary,
                                    shadowColor: C.primary, shadowOpacity: 0.9, shadowRadius: 8, elevation: 4,
                                    transform: [{
                                        translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, FRAME - 12] }),
                                    }],
                                }}
                            />
                        </View>
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
                    </View>

                    {/* Bottom dim + instruction */}
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', paddingTop: 28 }}>
                        <View style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
                            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.sm,
                            paddingHorizontal: 18, paddingVertical: 11,
                        }}>
                            {loading
                                ? <ActivityIndicator size="small" color={C.primary} />
                                : <Ionicons name="barcode-outline" size={18} color={C.primary} />}
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                                {loading ? 'جاري البحث...' : 'وجّه الكاميرا نحو الباركود'}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Drug result bottom sheet */}
            {drugResult && (
                <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: C.card,
                    borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    padding: 22, paddingBottom: Platform.OS === 'ios' ? 44 : 26,
                }}>
                    {/* Drag handle */}
                    <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />

                    {/* Drug header */}
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <View style={{ width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="medkit" size={26} color={C.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: C.foreground, fontWeight: '800', fontSize: 17, textAlign: 'right' }} numberOfLines={1}>
                                {drugResult.name}
                            </Text>
                            {drugResult.scientificName && (
                                <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>
                                    {drugResult.scientificName}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Price + Stock stats */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 20 }}>
                        <View style={{ flex: 1, backgroundColor: C.background, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: `${C.primary}33`, padding: 14, alignItems: 'center' }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 11, marginBottom: 6 }}>السعر</Text>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 3 }}>
                                <Text style={{ color: C.primary, fontWeight: '900', fontSize: 19 }}>
                                    {drugResult.price.toLocaleString()}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '700' }}>د.ع</Text>
                            </View>
                        </View>
                        <View style={{ flex: 1, backgroundColor: C.background, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: `${C.primary}33`, padding: 14, alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>المخزون</Text>
                            <Badge label={String(drugResult.quantity)} variant={stockVariant} />
                            <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                                حد الطلب: {drugResult.reorderLevel}
                            </Text>
                        </View>
                    </View>

                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                        <TouchableOpacity
                            onPress={handleAddToCart}
                            activeOpacity={0.85}
                            style={{
                                flex: 2, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 7,
                                backgroundColor: C.primary, borderRadius: Radius.sm, paddingVertical: 14,
                            }}
                        >
                            <Ionicons name="cart-outline" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>إضافة للسلة</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleReset}
                            activeOpacity={0.8}
                            style={{
                                flex: 1, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 6,
                                backgroundColor: C.card, borderRadius: Radius.sm, paddingVertical: 14,
                                borderWidth: 1.5, borderColor: C.border,
                            }}
                        >
                            <Ionicons name="scan-outline" size={17} color={C.foreground} />
                            <Text style={{ color: C.foreground, fontWeight: '700', fontSize: 14 }}>مسح آخر</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}
