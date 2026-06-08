import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
    Image, ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';
import { apiService } from '../services/api';

// مفتاح AsyncStorage لتمرير الأدوية المحددة إلى شاشة المبيعات
export const PRESCRIPTION_DRUGS_KEY = 'pendingPrescriptionDrugs';

// الإطار الأزرق: عرضه 80% وارتفاعه 60% — نفس قيم الـ UI
const FRAME_WIDTH_RATIO  = 0.80;
const FRAME_HEIGHT_RATIO = 0.60;

export default function ScanPrescriptionScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [loading, setLoading]           = useState(false);
    const [photoUri, setPhotoUri]         = useState<string | null>(null);
    const [rawText, setRawText]           = useState<string>('');
    const [suggestions, setSuggestions]   = useState<any[]>([]);
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [step, setStep]                 = useState<'camera' | 'review'>('camera');

    if (!permission) return <View style={{ flex: 1, backgroundColor: C.background }} />;
    if (!permission.granted) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Text style={{ fontSize: 16, color: C.foreground, textAlign: 'center', marginBottom: 20 }}>
                    نحتاج إذن الكاميرا لتصوير الوصفة
                </Text>
                <TouchableOpacity
                    style={{ backgroundColor: C.primary, padding: 14, borderRadius: 12, alignItems: 'center', width: '100%' }}
                    onPress={requestPermission}
                >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>منح الإذن</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── قص الصورة لتطابق الإطار الأزرق ──────────────────────────────────────
    const cropToFrame = async (uri: string): Promise<string> => {
        const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
        const { width: imgW, height: imgH } = info;
        const cropW    = Math.round(imgW * FRAME_WIDTH_RATIO);
        const cropH    = Math.round(imgH * FRAME_HEIGHT_RATIO);
        const originX  = Math.round((imgW - cropW) / 2);
        const originY  = Math.round((imgH - cropH) / 2);
        const cropped  = await ImageManipulator.manipulateAsync(
            uri,
            [{ crop: { originX, originY, width: cropW, height: cropH } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        return cropped.base64!;
    };

    // ── التقاط الصورة من الكاميرا ────────────────────────────────────────────
    const takePicture = async () => {
        if (cameraRef.current && !loading) {
            try {
                setLoading(true);
                const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 1 });
                if (photo?.uri) {
                    setPhotoUri(photo.uri);
                    const croppedBase64 = await cropToFrame(photo.uri);
                    processImage(croppedBase64);
                } else {
                    setLoading(false);
                }
            } catch {
                Alert.alert('خطأ', 'فشل التقاط الصورة');
                setLoading(false);
            }
        }
    };

    // ── اختيار صورة من المعرض ────────────────────────────────────────────────
    const pickImage = async () => {
        try {
            const ImagePicker = require('expo-image-picker');
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('تنبيه', 'نحتاج إذن للوصول إلى معرض الصور');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.5,
                base64: true,
            });
            if (!result.canceled && result.assets?.[0]?.base64) {
                setLoading(true);
                setPhotoUri(result.assets[0].uri);
                processImage(result.assets[0].base64);
            } else if (!result.canceled) {
                Alert.alert('خطأ', 'فشل قراءة الصورة');
            }
        } catch {
            Alert.alert('خطأ', 'يرجى التأكد من تثبيت expo-image-picker');
        }
    };

    // ── إرسال الصورة للـ API ──────────────────────────────────────────────────
    const processImage = async (base64: string) => {
        try {
            console.log('[PRESCRIPTION] Sending image, base64 length:', base64.length);
            if (base64.length < 1000) {
                console.error('[PRESCRIPTION] Image too small, likely failed capture!');
                Alert.alert('خطأ', 'الصورة صغيرة جداً، يرجى التصوير مجدداً');
                setLoading(false);
                return;
            }
            const result = await apiService.scanPrescription(base64);
            console.log('[PRESCRIPTION] API result rawText:', result.rawText);
            console.log('[PRESCRIPTION] API suggestions count:', result.suggestions?.length);
            const sugg = result.suggestions || [];
            setRawText(result.rawText || 'لم يتم قراءة نصوص واضحة');
            setSuggestions(sugg);
            // تحديد الأدوية المتوفرة فقط تلقائياً
            setSelectedIds(new Set(sugg.filter((s: any) => s.inStock !== false).map((s: any) => s.id)));
            setStep('review');
        } catch (error: any) {
            Alert.alert('خطأ', error.message || 'حدث خطأ أثناء تحليل الصورة');
            setPhotoUri(null);
        } finally {
            setLoading(false);
        }
    };

    // ── تبديل تحديد دواء ─────────────────────────────────────────────────────
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ── إضافة المحددة إلى سلة المبيعات ──────────────────────────────────────
    const handleAddSelected = async () => {
        const selected = suggestions.filter(s => selectedIds.has(s.id) && (s as any).inStock !== false);
        if (selected.length === 0) {
            Alert.alert('تنبيه', 'يرجى تحديد دواء متوفر في المخزون');
            return;
        }
        try {
            // نخزن أسماء الأدوية في AsyncStorage لتقرأها شاشة المبيعات
            await AsyncStorage.setItem(
                PRESCRIPTION_DRUGS_KEY,
                JSON.stringify(selected.map((s: any) => s.tradeName)),
            );
            router.push('/(tabs)/sales');
        } catch {
            Alert.alert('خطأ', 'تعذر الانتقال إلى نقطة البيع');
        }
    };

    // ════════════════════════════════════════════════════════════════════════════
    // شاشة النتائج
    // ════════════════════════════════════════════════════════════════════════════
    if (step === 'review') {
        const selectedCount = suggestions.filter(s => selectedIds.has(s.id) && (s as any).inStock !== false).length;

        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                <Stack.Screen options={{ title: 'نتائج تحليل الوصفة', headerShown: true }} />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: selectedCount > 0 ? 110 : 30 }}
                >
                    {photoUri && (
                        <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, resizeMode: 'cover' }} />
                    )}

                    {/* النص المقروء */}
                    <View style={{
                        margin: 16, padding: 16,
                        backgroundColor: C.card,
                        borderRadius: 8, borderWidth: 1, borderColor: C.border,
                    }}>
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Ionicons name="document-text" size={20} color={C.primary} />
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>النص المقروء من الوصفة:</Text>
                        </View>
                        <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'right', lineHeight: 22 }}>
                            {rawText}
                        </Text>
                    </View>

                    {/* الأدوية المقترحة */}
                    <View style={{ paddingHorizontal: 16 }}>
                        {/* رأس القسم + تحديد الكل / إلغاء الكل */}
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 12 }}>
                            <Ionicons name="medical" size={20} color={C.success} />
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground, flex: 1, marginRight: 8, textAlign: 'right' }}>
                                الأدوية المقترحة ({suggestions.length})
                            </Text>
                            {suggestions.some((s: any) => s.inStock !== false) && (
                                <TouchableOpacity
                                    onPress={() => {
                                        const inStockIds = suggestions
                                            .filter((s: any) => s.inStock !== false)
                                            .map((s: any) => s.id);
                                        if (inStockIds.every((id: string) => selectedIds.has(id))) {
                                            setSelectedIds(new Set());
                                        } else {
                                            setSelectedIds(new Set(inStockIds));
                                        }
                                    }}
                                    style={{
                                        backgroundColor: C.input, borderRadius: 8,
                                        paddingHorizontal: 10, paddingVertical: 5,
                                        borderWidth: 1, borderColor: C.border,
                                    }}
                                >
                                    <Text style={{ fontSize: 12, color: C.primary, fontWeight: '600' }}>
                                        {selectedCount === suggestions.filter((s: any) => s.inStock !== false).length ? 'إلغاء الكل' : 'تحديد الكل'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {suggestions.length === 0 ? (
                            <View style={{ alignItems: 'center', marginTop: 30, gap: 10 }}>
                                <Ionicons name="search-outline" size={48} color={C.mutedForeground} />
                                <Text style={{ textAlign: 'center', color: C.mutedForeground, fontSize: 15 }}>
                                    لم يتم التعرف على أي أدوية في الوصفة
                                </Text>
                            </View>
                        ) : (
                            suggestions.map((item) => {
                                const isSelected = selectedIds.has(item.id);
                                const inStock    = (item as any).inStock !== false;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        activeOpacity={inStock ? 0.8 : 1}
                                        onPress={() => inStock && toggleSelect(item.id)}
                                        style={{
                                            flexDirection: 'row-reverse',
                                            alignItems: 'center',
                                            backgroundColor: !inStock
                                                ? C.input
                                                : isSelected ? `${C.primary}12` : C.card,
                                            padding: 14,
                                            borderRadius: 12,
                                            marginBottom: 10,
                                            borderWidth: 2,
                                            borderColor: !inStock
                                                ? C.border
                                                : isSelected ? C.primary : C.border,
                                            gap: 10,
                                            opacity: inStock ? 1 : 0.65,
                                        }}
                                    >
                                        {/* Checkbox — مخفي للأدوية غير المتوفرة */}
                                        {inStock && (
                                        <View style={{
                                            width: 24, height: 24,
                                            borderRadius: 6,
                                            borderWidth: 2,
                                            borderColor: isSelected ? C.primary : C.border,
                                            backgroundColor: isSelected ? C.primary : 'transparent',
                                            justifyContent: 'center', alignItems: 'center',
                                            flexShrink: 0,
                                        }}>
                                            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                                        </View>
                                        )}

                                        {/* معلومات الدواء */}
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: C.foreground, textAlign: 'right' }}>
                                                {item.tradeName}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: C.mutedForeground, textAlign: 'right', marginTop: 3 }}>
                                                {inStock ? (
                                                    <>
                                                        مطابق بنسبة{' '}
                                                        <Text style={{ color: C.success, fontWeight: '600' }}>{item.confidence}</Text>
                                                        {'  ·  '}
                                                        <Text style={{ color: C.mutedForeground }}>{item.matchedFrom}</Text>
                                                    </>
                                                ) : (
                                                    <Text style={{ color: C.mutedForeground }}>تم التعرف عليه من الوصفة</Text>
                                                )}
                                            </Text>
                                        </View>

                                        {/* شارة التوفر */}
                                        <View style={{
                                            backgroundColor: inStock ? `${C.success}20` : `${C.mutedForeground}20`,
                                            paddingHorizontal: 8, paddingVertical: 4,
                                            borderRadius: 6, flexShrink: 0,
                                        }}>
                                            <Text style={{ fontSize: 11, color: inStock ? C.success : C.mutedForeground, fontWeight: '700' }}>
                                                {inStock ? '✓ متوفر' : '✗ غير متوفر'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                </ScrollView>

                {/* زر الإضافة الثابت في الأسفل */}
                {selectedCount > 0 && (
                    <View style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: 16,
                        backgroundColor: C.card,
                        borderTopWidth: 1, borderTopColor: C.border,
                    }}>
                        <TouchableOpacity
                            onPress={handleAddSelected}
                            style={{
                                backgroundColor: C.primary,
                                borderRadius: 14,
                                padding: 16,
                                flexDirection: 'row-reverse',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                            }}
                        >
                            <Ionicons name="cart" size={22} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                                إضافة {selectedCount} {selectedCount === 1 ? 'دواء' : 'أدوية'} إلى السلة
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    }

    // ════════════════════════════════════════════════════════════════════════════
    // شاشة الكاميرا
    // ════════════════════════════════════════════════════════════════════════════
    return (
        <View style={{ flex: 1 }}>
            <View style={{ position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 }}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginRight: 16 }}>تصوير الوصفة (AI)</Text>
            </View>

            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} autofocus={'on'} />

            {/* الإطار الأزرق المرئي */}
            <View style={StyleSheet.absoluteFillObject}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{
                        width: '80%', height: '60%',
                        borderWidth: 2, borderColor: '#3b82f6',
                        borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.08)',
                    }} />
                    <Text style={{
                        color: '#fff', marginTop: 16, fontSize: 13,
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                    }}>
                        اجعل الوصفة داخل الإطار وتأكد من وضوح الكلمات
                    </Text>
                </View>
            </View>

            {/* أزرار الكاميرا */}
            <View style={{ position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 30 }}>
                <TouchableOpacity
                    style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                    onPress={pickImage}
                    disabled={loading}
                >
                    <Ionicons name="images" size={28} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff', padding: 4, justifyContent: 'center', alignItems: 'center', opacity: loading ? 0.8 : 1 }}
                    onPress={takePicture}
                    disabled={loading}
                >
                    {loading
                        ? <ActivityIndicator color={C.primary} size="large" />
                        : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary }} />
                    }
                </TouchableOpacity>

                <View style={{ width: 50, height: 50 }} />
            </View>

            {loading && (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 20 }]}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: 'bold' }}>
                        جاري تحليل الوصفة بالذكاء الاصطناعي...
                    </Text>
                </View>
            )}
        </View>
    );
}
