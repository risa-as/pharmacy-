import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
    Image, ScrollView, Alert, useWindowDimensions, Modal, StatusBar, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton, InfoNote, StateBlock } from '../components/ui/Kit';
import { Radius } from '../constants/colors';
import * as ImageManipulator from 'expo-image-manipulator';
import {
    PinchGestureHandler, PanGestureHandler, TapGestureHandler,
    GestureHandlerRootView, State,
} from 'react-native-gesture-handler';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';
import { apiService } from '../services/api';

// ── مشاهد الصورة بالتقريب والتحريك (Animated فقط — يعمل في Expo Go) ─────────
function ImageZoomModal({ uri, onClose }: { uri: string; onClose: () => void }) {
    const { width, height } = useWindowDimensions();

    const baseScale  = useRef(new Animated.Value(1)).current;
    const pinchScale = useRef(new Animated.Value(1)).current;
    const scale      = Animated.multiply(baseScale, pinchScale);
    const savedScale = useRef(1);

    const transX      = useRef(new Animated.Value(0)).current;
    const transY      = useRef(new Animated.Value(0)).current;
    const savedX      = useRef(0);
    const savedY      = useRef(0);

    const pinchRef = useRef<any>(null);
    const panRef   = useRef<any>(null);
    const tapRef   = useRef<any>(null);

    const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });

    const onPinchStateChange = (e: any) => {
        if (e.nativeEvent.oldState === State.ACTIVE) {
            const newScale = Math.min(Math.max(savedScale.current * e.nativeEvent.scale, 1), 5);
            savedScale.current = newScale;
            pinchScale.setValue(1);
            baseScale.setValue(newScale);
            if (newScale <= 1) {
                Animated.spring(transX, { toValue: 0, useNativeDriver: true }).start();
                Animated.spring(transY, { toValue: 0, useNativeDriver: true }).start();
                savedX.current = 0;
                savedY.current = 0;
            }
        }
    };

    const onPanEvent = Animated.event(
        [{ nativeEvent: { translationX: transX, translationY: transY } }],
        { useNativeDriver: true },
    );

    const onPanStateChange = (e: any) => {
        if (e.nativeEvent.oldState === State.ACTIVE) {
            savedX.current += e.nativeEvent.translationX;
            savedY.current += e.nativeEvent.translationY;
            transX.setOffset(savedX.current);
            transY.setOffset(savedY.current);
            transX.setValue(0);
            transY.setValue(0);
        }
    };

    const onDoubleTap = (e: any) => {
        if (e.nativeEvent.state === State.ACTIVE) {
            savedScale.current = 1;
            baseScale.setValue(1);
            pinchScale.setValue(1);
            Animated.spring(transX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(transY, { toValue: 0, useNativeDriver: true }).start();
            transX.setOffset(0); transY.setOffset(0);
            savedX.current = 0; savedY.current = 0;
        }
    };

    return (
        <Modal visible animationType="fade" transparent statusBarTranslucent>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000ee', justifyContent: 'center', alignItems: 'center' }}>
                <StatusBar hidden />
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                <TapGestureHandler ref={tapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
                    <Animated.View>
                        <PanGestureHandler
                            ref={panRef}
                            simultaneousHandlers={pinchRef}
                            onGestureEvent={onPanEvent}
                            onHandlerStateChange={onPanStateChange}
                            avgTouches
                        >
                            <Animated.View>
                                <PinchGestureHandler
                                    ref={pinchRef}
                                    simultaneousHandlers={panRef}
                                    onGestureEvent={onPinchEvent}
                                    onHandlerStateChange={onPinchStateChange}
                                >
                                    <Animated.Image
                                        source={{ uri }}
                                        style={{
                                            width, height: height * 0.85,
                                            resizeMode: 'contain',
                                            transform: [{ scale }, { translateX: transX }, { translateY: transY }],
                                        }}
                                    />
                                </PinchGestureHandler>
                            </Animated.View>
                        </PanGestureHandler>
                    </Animated.View>
                </TapGestureHandler>
                <TouchableOpacity
                    onPress={onClose}
                    style={{ position: 'absolute', top: 50, right: 20, backgroundColor: '#00000088', borderRadius: 20, padding: 8 }}
                >
                    <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
            </GestureHandlerRootView>
        </Modal>
    );
}

// مفتاح AsyncStorage لتمرير الأدوية المحددة إلى شاشة المبيعات
export const PRESCRIPTION_DRUGS_KEY = 'pendingPrescriptionDrugs';

// الإطار: عرضه 80% وارتفاعه 60% — نفس قيم الـ UI
const FRAME_WIDTH_RATIO  = 0.80;
const FRAME_HEIGHT_RATIO = 0.60;

const CORNER_LENGTH = 30;
const CORNER_WIDTH  = 3;

/** ركن واحد من أركان إطار الالتقاط (التصميم يرسم الزوايا لا مستطيلاً كاملاً). */
function FrameCorner({ top, bottom, left, right }: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) {
    return (
        <View
            style={{
                position: 'absolute', width: CORNER_LENGTH, height: CORNER_LENGTH,
                ...(top ? { top: 0 } : { bottom: 0 }),
                ...(left ? { left: 0 } : { right: 0 }),
                borderColor: '#fff',
                borderTopWidth: top ? CORNER_WIDTH : 0,
                borderBottomWidth: bottom ? CORNER_WIDTH : 0,
                borderLeftWidth: left ? CORNER_WIDTH : 0,
                borderRightWidth: right ? CORNER_WIDTH : 0,
                borderTopLeftRadius: top && left ? Radius.card : 0,
                borderTopRightRadius: top && right ? Radius.card : 0,
                borderBottomLeftRadius: bottom && left ? Radius.card : 0,
                borderBottomRightRadius: bottom && right ? Radius.card : 0,
            }}
        />
    );
}

export default function ScanPrescriptionScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const { width: screenW, height: screenH } = useWindowDimensions();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [loading, setLoading]           = useState(false);
    const [photoUri, setPhotoUri]         = useState<string | null>(null);
    const [croppedUri, setCroppedUri]     = useState<string | null>(null);
    const [zoomVisible, setZoomVisible]   = useState(false);
    const [rawText, setRawText]           = useState<string>('');
    const [suggestions, setSuggestions]   = useState<any[]>([]);
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [step, setStep]                 = useState<'camera' | 'review'>('camera');
    const [scanUsage, setScanUsage]       = useState<{ limit: number; used: number; remaining: number } | null>(null);
    const [reviewed, setReviewed]         = useState(false);
    // Measured heights of the two overlays, so the frame sits clear of both.
    const [captureCardHeight, setCaptureCardHeight] = useState(140);
    const [headerHeight, setHeaderHeight] = useState(110);
    // Height of the review screen's fixed bottom bar (confirm + continue).
    const [actionBarHeight, setActionBarHeight] = useState(180);
    // The frame's on-screen rectangle; the crop is taken from exactly this area.
    const frameRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
    const insets = useSafeAreaInsets();

    // جلب حالة الاستخدام عند فتح الشاشة
    React.useEffect(() => {
        apiService.getScanUsage().then(setScanUsage);
    }, []);

    if (!permission) return <View style={{ flex: 1, backgroundColor: C.background }}><StateBlock loading title="جارِ التحقق من إذن الكاميرا…" /></View>;
    if (!permission.granted && step === 'camera') {
        const usageText = scanUsage
            ? (scanUsage.remaining === 0 ? 'نفدت مسوحات اليوم — تتجدد منتصف الليل.' : `المستخدم ${scanUsage.used} من ${scanUsage.limit} · المتبقي ${scanUsage.remaining} اليوم`)
            : null;
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                <ScreenHeader title="فحص الوصفة" fallbackHref={'/(tabs)/more' as Href} />
                <View style={{ padding: 16, gap: 12 }}>
                    <StateBlock
                        icon="camera-outline"
                        title="إذن الكاميرا مطلوب"
                        message={permission.canAskAgain ? 'نحتاج إذن الكاميرا لتصوير الوصفة.' : 'تم رفض إذن الكاميرا. فعّله من إعدادات الجهاز، أو اختر صورة من المعرض.'}
                    />
                    <AppButton
                        label={permission.canAskAgain ? 'منح الإذن' : 'فتح إعدادات الجهاز'}
                        icon="camera-outline"
                        onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
                    />
                    <AppButton label="اختيار صورة من المعرض" icon="images-outline" variant="outline" loading={loading} disabled={scanUsage?.remaining === 0} onPress={() => pickImage()} />
                    {usageText ? <InfoNote tone={scanUsage?.remaining === 0 ? 'danger' : 'primary'} text={usageText} /> : null}
                </View>
            </View>
        );
    }

    // ── قص الصورة لتطابق الإطار الأزرق بدقة ────────────────────────────────
    const cropToFrame = async (uri: string): Promise<{ base64: string; croppedUri: string }> => {
        const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
        let { width: imgW, height: imgH } = info;
        let processUri = uri;

        // إذا التقطت الصورة أفقياً (الهاتف مُدوَّر) نُدوِّرها لتطابق الشاشة الرأسية
        if (imgW > imgH) {
            const rotated = await ImageManipulator.manipulateAsync(
                uri,
                [{ rotate: 90 }],
                { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
            );
            processUri = rotated.uri;
            [imgW, imgH] = [imgH, imgW];
        }

        const screenRatio = screenW / screenH;
        const imageRatio  = imgW / imgH;

        let visW: number, visH: number, visX: number, visY: number;
        if (imageRatio > screenRatio) {
            visH = imgH;
            visW = Math.round(imgH * screenRatio);
            visX = Math.round((imgW - visW) / 2);
            visY = 0;
        } else {
            visW = imgW;
            visH = Math.round(imgW / screenRatio);
            visX = 0;
            visY = Math.round((imgH - visH) / 2);
        }

        // The drawn frame is the source of truth: map its on-screen rectangle
        // into image pixels. (It is no longer centred — the capture card takes
        // the bottom of the screen — so a centred crop would not match it.)
        const frame = frameRect.current;
        const fx = frame ? frame.x / screenW : (1 - FRAME_WIDTH_RATIO) / 2;
        const fy = frame ? frame.y / screenH : (1 - FRAME_HEIGHT_RATIO) / 2;
        const fw = frame ? frame.width / screenW : FRAME_WIDTH_RATIO;
        const fh = frame ? frame.height / screenH : FRAME_HEIGHT_RATIO;

        const cropW   = Math.round(visW * fw);
        const cropH   = Math.round(visH * fh);
        const originX = visX + Math.round(visW * fx);
        const originY = visY + Math.round(visH * fy);

        const cropped = await ImageManipulator.manipulateAsync(
            processUri,
            [{ crop: { originX, originY, width: cropW, height: cropH } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        return { base64: cropped.base64!, croppedUri: cropped.uri };
    };

    // ── التقاط الصورة من الكاميرا ────────────────────────────────────────────
    const takePicture = async () => {
        if (cameraRef.current && !loading) {
            try {
                setLoading(true);
                const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 1 });
                if (photo?.uri) {
                    setPhotoUri(photo.uri);
                    const { base64, croppedUri } = await cropToFrame(photo.uri);
                    setCroppedUri(croppedUri);
                    processImage(base64);
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
    async function pickImage() {
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
                setCroppedUri(result.assets[0].uri);
                processImage(result.assets[0].base64);
            } else if (!result.canceled) {
                Alert.alert('خطأ', 'فشل قراءة الصورة');
            }
        } catch {
            Alert.alert('خطأ', 'تعذّر فتح معرض الصور');
        }
    }

    // ── إرسال الصورة للـ API ──────────────────────────────────────────────────
    async function processImage(base64: string) {
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
            setReviewed(false);
            setStep('review');
            // تحديث عداد الاستخدام بعد المسح الناجح
            apiService.getScanUsage().then(setScanUsage);
        } catch (error: any) {
            Alert.alert('خطأ', error.message || 'حدث خطأ أثناء تحليل الصورة');
            setPhotoUri(null);
        } finally {
            setLoading(false);
        }
    }

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
        if (!reviewed) {
            Alert.alert('مراجعة مطلوبة', 'أكّد أنك راجعت النتائج مع الوصفة قبل إضافتها للبيع.');
            return;
        }
        try {
            // نخزن أسماء الأدوية في AsyncStorage لتقرأها شاشة المبيعات
            await AsyncStorage.setItem(
                PRESCRIPTION_DRUGS_KEY,
                JSON.stringify(selected.map((s: any) => s.tradeName)),
            );
            router.push('/(tabs)/sales' as Href);
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
                <ScreenHeader title="مراجعة النتائج" subtitle="نتائج مساعدة — القرار للصيدلاني" onBack={() => { setStep('camera'); setSuggestions([]); setSelectedIds(new Set()); }} />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    // Reserve exactly the height of the fixed bar; a fixed guess
                    // leaves the last drug card half-hidden behind it.
                    contentContainerStyle={{ paddingBottom: (selectedCount > 0 ? actionBarHeight : 0) + 24 }}
                >
                    {croppedUri && (
                        <>
                            <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomVisible(true)}>
                                <Image source={{ uri: croppedUri }} style={{ width: '100%', height: 180, resizeMode: 'cover' }} />
                                <View style={{
                                    position: 'absolute', bottom: 8, right: 8,
                                    backgroundColor: '#00000066', borderRadius: 14, padding: 6,
                                    flexDirection: 'row', alignItems: 'center', gap: 4,
                                }}>
                                    <Ionicons name="expand-outline" size={16} color="#fff" />
                                </View>
                            </TouchableOpacity>
                            {zoomVisible && (
                                <ImageZoomModal uri={croppedUri} onClose={() => setZoomVisible(false)} />
                            )}
                        </>
                    )}

                    {/* النص المقروء */}
                    <View style={{
                        margin: 16, padding: 14,
                        backgroundColor: C.card,
                        borderRadius: Radius.card, borderWidth: 1, borderColor: C.border,
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
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                            <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: C.primary }} />
                            <Text style={{ fontSize: 16, fontWeight: '800', color: C.foreground, flex: 1, textAlign: 'right' }}>
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
                                        backgroundColor: C.input, borderRadius: Radius.badge,
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
                                                : isSelected ? C.primaryMuted : C.card,
                                            padding: 12,
                                            borderRadius: Radius.card,
                                            marginBottom: 10,
                                            borderWidth: 1,
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
                                            width: 22, height: 22,
                                            borderRadius: Radius.badge,
                                            borderWidth: 1,
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
                                            backgroundColor: inStock ? C.successBg : C.input,
                                            borderWidth: 1, borderColor: inStock ? `${C.success}55` : C.border,
                                            paddingHorizontal: 8, paddingVertical: 3,
                                            borderRadius: Radius.badge, flexShrink: 0,
                                        }}>
                                            <Text style={{ fontSize: 11, color: inStock ? C.success : C.mutedForeground, fontWeight: '700' }}>
                                                {inStock ? 'متوفر' : 'غير متوفر'}
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
                    <View
                        onLayout={e => setActionBarHeight(e.nativeEvent.layout.height)}
                        style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: 16, paddingBottom: insets.bottom + 16,
                        backgroundColor: C.card,
                        borderTopWidth: 1, borderTopColor: C.border,
                    }}>
                        {/* تأكيد المراجعة — بطاقة مستقلة كما في التصميم */}
                        <TouchableOpacity
                            onPress={() => setReviewed(v => !v)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: reviewed }}
                            activeOpacity={0.8}
                            style={{
                                flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12,
                                borderWidth: 1, borderColor: reviewed ? C.primary : C.border,
                                backgroundColor: reviewed ? C.primaryMuted : C.card,
                                borderRadius: Radius.card, paddingHorizontal: 12, paddingVertical: 10,
                            }}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: C.foreground, fontSize: 14.5, fontWeight: '800', textAlign: 'right' }}>راجعت النتائج</Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 1 }}>أؤكد أني راجعت النتائج قبل إضافتها للبيع</Text>
                            </View>
                            <Ionicons name={reviewed ? 'checkbox' : 'square-outline'} size={24} color={reviewed ? C.primary : C.mutedForeground} />
                        </TouchableOpacity>
                        <AppButton
                            label={`متابعة إلى البيع (${selectedCount})`}
                            icon="arrow-back"
                            disabled={!reviewed}
                            onPress={handleAddSelected}
                            style={{ paddingVertical: 13 }}
                        />
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
            {/* شريط العنوان + مؤشر الاستخدام — متكدسان رأسياً */}
            <View
                onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}
                style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, zIndex: 10, alignItems: 'center', gap: 8 }}
            >
                {/* صف العنوان وزر الرجوع (أعلى اليمين) */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', width: '100%', paddingHorizontal: 16, gap: 12 }}>
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more' as Href))}
                        accessibilityLabel="رجوع"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)', width: 42, height: 42, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="arrow-forward" size={22} color="#fff" />
                    </TouchableOpacity>
                    <Text style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'right' }}>فحص الوصفة</Text>
                </View>

                {/* تنبيه التصميم: النتائج مساعدة والقرار للصيدلاني */}
                <View style={{
                    marginHorizontal: 16, alignSelf: 'stretch',
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
                    backgroundColor: C.warningBg, borderWidth: 1, borderColor: `${C.warning}55`,
                    borderRadius: Radius.card, paddingHorizontal: 12, paddingVertical: 6,
                }}>
                    <Ionicons name="alert-circle-outline" size={20} color={C.warning} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.warning, fontSize: 13.5, fontWeight: '800', textAlign: 'right' }}>مساعدة للصيدلاني</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>راجع النتائج قبل إضافتها للبيع</Text>
                    </View>
                </View>

                {/* مؤشر الاستخدام اليومي */}
                {scanUsage && (
                    <View style={{
                        backgroundColor: scanUsage.remaining === 0 ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.6)',
                        paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
                        flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                    }}>
                        <Ionicons name="scan" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                            {scanUsage.remaining === 0
                                ? 'نفذت مسوحات اليوم — تتجدد منتصف الليل'
                                : `المستخدم ${scanUsage.used} من ${scanUsage.limit} · المتبقي ${scanUsage.remaining} اليوم`}
                        </Text>
                    </View>
                )}
            </View>

            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} autofocus={'on'} />

            {/* إطار الالتقاط — زواياه فقط، كما في التصميم. يُوضع في المساحة
                الخالية بين الترويسة وبطاقة التصوير، والقصّ يتبع موضعه الفعلي. */}
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <View style={{
                    flex: 1, justifyContent: 'center', alignItems: 'center',
                    paddingTop: insets.top + headerHeight + 20, paddingBottom: captureCardHeight + 16,
                }}>
                    <View
                        onLayout={e => { frameRect.current = e.nativeEvent.layout; }}
                        style={{ width: '84%', height: '92%' }}
                    >
                        <FrameCorner top left />
                        <FrameCorner top right />
                        <FrameCorner bottom left />
                        <FrameCorner bottom right />
                    </View>
                </View>
            </View>

            {/* بطاقة التصوير السفلية (التصميم): عنوان وإرشاد وزرّان مكتوبان */}
            {(() => {
                const limitReached = scanUsage !== null && scanUsage.remaining === 0;
                return (
                    <View
                        onLayout={e => setCaptureCardHeight(e.nativeEvent.layout.height)}
                        style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
                        borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
                        padding: 16, paddingBottom: insets.bottom + 16, gap: 12,
                    }}>
                        <View>
                            <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800', textAlign: 'right' }}>تصوير الوصفة</Text>
                            <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right', marginTop: 2 }}>
                                ضع الوصفة كاملة داخل الإطار وتأكد من وضوح الكلمات
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                            <AppButton
                                label="تصوير"
                                icon="camera-outline"
                                style={{ flex: 1, paddingVertical: 12 }}
                                loading={loading}
                                disabled={loading || limitReached}
                                onPress={takePicture}
                            />
                            <AppButton
                                label="اختيار صورة"
                                icon="image-outline"
                                variant="outline"
                                style={{ flex: 1, paddingVertical: 12 }}
                                disabled={loading || limitReached}
                                onPress={pickImage}
                            />
                        </View>
                    </View>
                );
            })()}

            {loading && (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 20 }]}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: 'bold' }}>
                        جارِ قراءة الوصفة…
                    </Text>
                </View>
            )}
        </View>
    );
}
