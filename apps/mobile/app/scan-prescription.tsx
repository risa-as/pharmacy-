import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, FlatList, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';
import { apiService } from '../services/api';

export default function ScanPrescriptionScreen() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [loading, setLoading] = useState(false);
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [rawText, setRawText] = useState<string>('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [step, setStep] = useState<'camera' | 'review'>('camera');

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

    const takePicture = async () => {
        if (cameraRef.current && !loading) {
            try {
                setLoading(true);
                const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
                if (photo && photo.base64) {
                    setPhotoUri(photo.uri);
                    processImage(photo.base64);
                } else {
                    setLoading(false);
                }
            } catch {
                Alert.alert('خطأ', 'فشل التقاط الصورة');
                setLoading(false);
            }
        }
    };

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

    const processImage = async (base64: string) => {
        try {
            const result = await apiService.scanPrescription(base64);
            setRawText(result.rawText || 'لم يتم قراءة نصوص واضحة');
            setSuggestions(result.suggestions || []);
            setStep('review');
        } catch (error: any) {
            Alert.alert('خطأ', error.message || 'حدث خطأ أثناء تحليل الصورة');
            setPhotoUri(null);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDrug = (drug: any) => {
        router.push({ pathname: '/(tabs)/sales', params: { scannedBarcode: drug.id } });
    };

    if (step === 'review') {
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                {/* Review Header */}
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center',
                    padding: 16, paddingTop: 50,
                    backgroundColor: C.card,
                    borderBottomWidth: 1, borderBottomColor: C.border,
                }}>
                    <TouchableOpacity onPress={() => { setStep('camera'); setPhotoUri(null); }} style={{ padding: 4, marginLeft: 16 }}>
                        <Ionicons name="arrow-forward" size={24} color={C.foreground} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: C.foreground }}>نتائج تحليل الوصفة</Text>
                </View>

                {photoUri && <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, resizeMode: 'cover' }} />}

                {/* Raw Text */}
                <View style={{
                    margin: 16, padding: 16,
                    backgroundColor: C.card,
                    borderRadius: 16, borderWidth: 1, borderColor: C.border,
                }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Ionicons name="document-text" size={20} color={C.primary} />
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>النص المقروء من الوصفة:</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: C.mutedForeground, textAlign: 'right', lineHeight: 22 }}>
                        {rawText}
                    </Text>
                </View>

                {/* Suggestions */}
                <View style={{ flex: 1, paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Ionicons name="medical" size={20} color={C.success} />
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground }}>الأدوية المقترحة:</Text>
                    </View>

                    {suggestions.length === 0 ? (
                        <Text style={{ textAlign: 'center', marginTop: 20, color: C.mutedForeground, fontSize: 15 }}>
                            لم يتم التعرف على أدوية مطابقة في المخزون
                        </Text>
                    ) : (
                        <FlatList
                            data={suggestions}
                            keyExtractor={item => item.id}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <View style={{
                                    flexDirection: 'row-reverse', alignItems: 'center',
                                    backgroundColor: C.card,
                                    padding: 14, borderRadius: 12, marginBottom: 10,
                                    borderWidth: 1, borderColor: C.border,
                                }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.foreground, textAlign: 'right' }}>
                                            {item.tradeName}
                                        </Text>
                                        <Text style={{ fontSize: 13, color: C.success, textAlign: 'right', marginTop: 4 }}>
                                            مطابق بنسبة {item.confidence}
                                            <Text style={{ color: C.mutedForeground, fontSize: 12 }}> (من كلمة: {item.matchedFrom})</Text>
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={{
                                            flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
                                            backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                                        }}
                                        onPress={() => handleAddDrug(item)}
                                    >
                                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>إضافة</Text>
                                        <Ionicons name="add-circle" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        );
    }

    // Camera step — always dark UI (camera overlay)
    return (
        <View style={{ flex: 1 }}>
            <View style={{ position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 }}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginRight: 16 }}>تصوير الوصفة (AI)</Text>
            </View>

            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} autofocus={'on'} />

            <View style={StyleSheet.absoluteFillObject}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '80%', height: '60%', borderWidth: 2, borderColor: '#3b82f6', borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.1)' }} />
                    <Text style={{ color: '#fff', marginTop: 24, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                        اجعل الوصفة داخل الإطار وتأكد من وضوح الكلمات
                    </Text>
                </View>
            </View>

            <View style={{ position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 30 }}>
                <TouchableOpacity style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} onPress={pickImage} disabled={loading}>
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
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 20 }]}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: 'bold' }}>
                        جاري تحليل الوصفة بالذكاء الاصطناعي...
                    </Text>
                </View>
            )}
        </View>
    );
}
