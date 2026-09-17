import React, { useState } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router, Href, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { crmService } from '../../services/crm';
import { useCheckout } from '../../context/CheckoutContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, InfoNote, FormField, AppButton } from '../../components/ui/Kit';

const NOTES_MAX = 500;

/**
 * Add patient (design patient-add.png). Only the fields the server stores for
 * this form (name, phone, notes); required rules mirror POST /patients.
 * Errors appear beside a field only after the user has interacted with it.
 */
export default function PatientAddScreen() {
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const { forSale } = useLocalSearchParams<{ forSale?: string }>();
    const { setPatient } = useCheckout();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [touched, setTouched] = useState({ name: false, phone: false });
    const [serverError, setServerError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const nameError = !name.trim() ? 'يرجى إدخال الاسم الكامل.' : null;
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    const phoneError = !phoneDigits ? 'يرجى إدخال رقم الهاتف.' : null;
    const phoneHint = phoneDigits && !/^07\d{9}$/.test(phoneDigits) ? 'تأكد من الرقم — الصيغة المعتادة 07XXXXXXXXX' : 'مثال: 07XXXXXXXXX';

    const handleSave = async () => {
        setTouched({ name: true, phone: true });
        setServerError(null);
        if (nameError || phoneError) return;
        setLoading(true);
        try {
            const created = await crmService.createPatient({ name: name.trim(), phone: phoneDigits, notes: notes.trim() || undefined });
            const id = (created as any)?.id ?? (created as any)?.patient?.id;
            if (forSale === '1' && id) {
                // Opened from the sale flow: hand the new record back to the cart.
                setPatient({ id, name: name.trim(), phone: phoneDigits });
                router.back();
            } else if (id) router.replace(`/crm/${id}` as Href);
            else router.back();
        } catch (error: any) {
            const msg = String(error?.message ?? '');
            if (/already exists|409/i.test(msg)) setServerError('يوجد مريض مسجّل بنفس رقم الهاتف في هذا الفرع.');
            else Alert.alert('تعذّر الحفظ', 'لم يُحفظ المريض. تحقق من الاتصال وحاول مرة أخرى.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.background }}>
            <ScreenHeader title="إضافة مريض" fallbackHref={'/crm' as Href} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
                <InfoNote text="الحقول المعلّمة بنجمة مطلوبة." />
                <Surface style={{ gap: 16 }}>
                    <FormField
                        label="الاسم الكامل"
                        required
                        value={name}
                        onChangeText={setName}
                        onBlur={() => setTouched(t => ({ ...t, name: true }))}
                        placeholder="أدخل الاسم الكامل"
                        error={touched.name ? nameError : null}
                    />
                    <FormField
                        label="رقم الهاتف"
                        required
                        value={phone}
                        onChangeText={(v) => { setPhone(v); setServerError(null); }}
                        onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                        keyboardType="phone-pad"
                        placeholder="07XXXXXXXXX"
                        style={{ writingDirection: 'ltr' }}
                        error={serverError ?? (touched.phone ? phoneError : null)}
                        hint={phoneHint}
                    />
                    <FormField
                        label="ملاحظات"
                        value={notes}
                        onChangeText={(v) => setNotes(v.slice(0, NOTES_MAX))}
                        placeholder="أدخل أي ملاحظات إضافية"
                        multiline
                        hint={`${notes.length}/${NOTES_MAX}`}
                    />
                    <AppButton label="حفظ المريض" loading={loading} onPress={handleSave} />
                </Surface>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
