import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';
import { checkAndDownloadAppUpdate } from '../services/app-updates';
import { Surface, SectionTitle, usePalette } from './ui/Kit';
import { Text } from './ui/Typography';
import { useCheckout } from '../context/CheckoutContext';
import { Radius } from '../constants/colors';

type Status = 'idle' | 'checking' | 'current' | 'ready' | 'error' | 'restarting';

export function AppUpdateCard() {
    const C = usePalette();
    const { cart } = useCheckout();
    const { isUpdatePending, isChecking, isDownloading } = Updates.useUpdates();
    const [status, setStatus] = useState<Status>('idle');
    const [lastChecked, setLastChecked] = useState<Date>();
    const mounted = useRef(true);
    const busyRef = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const supported = !__DEV__ && Updates.isEnabled;
    const ready = isUpdatePending || status === 'ready';
    const busy = status === 'checking' || status === 'restarting' || isChecking || isDownloading;

    async function check() {
        if (!supported || busyRef.current || busy) return;
        busyRef.current = true;
        setStatus('checking');
        try {
            const result = await checkAndDownloadAppUpdate();
            if (!mounted.current) return;
            setStatus(result === 'ready' ? 'ready' : result === 'current' ? 'current' : 'idle');
            if (result === 'current' || result === 'ready') setLastChecked(new Date());
        } catch {
            if (mounted.current) setStatus('error');
        } finally { busyRef.current = false; }
    }

    function confirmRestart() {
        if (busy || busyRef.current || !ready) return;
        if (cart.length > 0) {
            Alert.alert('أكمل الفاتورة أولاً', 'توجد أصناف في سلة البيع. أكمل الفاتورة أو أفرغ السلة قبل إعادة تشغيل التطبيق.');
            return;
        }
        Alert.alert('تطبيق التحديث الآن؟', 'سيُعاد تشغيل التطبيق. احفظ أي فاتورة أو بيانات غير محفوظة قبل المتابعة. يمكنك أيضاً ترك التحديث ليُطبَّق عند فتح التطبيق لاحقاً.', [
            { text: 'لاحقاً', style: 'cancel' },
            { text: 'حفظت بياناتي، أعد التشغيل', onPress: () => {
                if (!mounted.current || busyRef.current) return;
                busyRef.current = true;
                setStatus('restarting');
                void Updates.reloadAsync().catch(() => {
                    busyRef.current = false;
                    if (!mounted.current) return;
                    setStatus('ready');
                    Alert.alert('تعذّر تطبيق التحديث', 'أغلق التطبيق بالكامل وافتحه مجدداً لتطبيق التحديث الذي تم تنزيله.');
                });
            } },
        ]);
    }

    const message = !supported ? 'التحقق من التحديثات متاح في نسخة التطبيق المثبّتة، ولا يعمل في وضع التطوير.'
        : status === 'restarting' ? 'جارٍ إعادة تشغيل التطبيق…'
        : isDownloading ? 'جارٍ تنزيل التحديث…'
        : busy ? 'جارٍ التحقق من التحديثات…'
        : ready ? 'تحديث جاهز للتطبيق'
        : status === 'error' ? 'تعذّر التحقق. تأكد من اتصالك بالإنترنت وحاول مجدداً.'
        : status === 'current' ? 'أنت تستخدم أحدث تحديث متاح لهذا الإصدار.'
        : 'يتحقق التطبيق من التحديثات تلقائياً، ويمكنك التحقق الآن أيضاً.';
    const label = ready ? 'تطبيق التحديث وإعادة التشغيل' : 'التحقق من التحديثات';

    return (
        <View>
            <SectionTitle title="تحديثات التطبيق" />
            <Surface style={{ gap: 12 }}>
                <Text accessibilityLiveRegion="polite" style={{ color: status === 'error' && !ready ? C.danger : ready ? C.success : C.foreground, textAlign: 'right', fontSize: 14 }}>{message}</Text>
                {ready && <Text style={{ color: C.mutedForeground, textAlign: 'right', fontSize: 12.5 }}>يمكنك تطبيقه الآن أو عند إغلاق التطبيق بالكامل وفتحه مجدداً.</Text>}
                {lastChecked && <Text style={{ color: C.mutedForeground, textAlign: 'right', fontSize: 12 }}>آخر تحقق ناجح: {lastChecked.toLocaleString('ar-IQ')}</Text>}
                {supported && <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={ready ? confirmRestart : check} style={{ backgroundColor: C.primary, borderRadius: Radius.control, padding: 12, minHeight: 48, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>{label}</Text>}
                </TouchableOpacity>}
                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>بعض التحديثات الأساسية تحتاج تثبيت إصدار جديد من التطبيق.</Text>
            </Surface>
        </View>
    );
}
