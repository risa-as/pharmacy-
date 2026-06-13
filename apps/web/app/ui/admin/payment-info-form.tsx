'use client';

import { useState } from 'react';
import { updatePlatformSettings, type PlatformSettingsData } from '@/app/lib/actions/platform-settings';
import { toast } from 'sonner';
import { Loader2, Building2, Smartphone, PhoneCall, Save } from 'lucide-react';

type FieldKey = keyof PlatformSettingsData;

type FieldDef = {
    key: FieldKey;
    label: string;
    placeholder: string;
    dir?: 'ltr';
    mono?: boolean;
    wide?: boolean;
    hint?: string;
};

const inputClass =
    'w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition';

// Defined at module scope (NOT inside the component) so the inputs keep their
// identity across re-renders — otherwise every keystroke remounts the field and
// the input loses focus.
function Field({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
    return (
        <div className={f.wide ? 'sm:col-span-2' : ''}>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{f.label}</label>
            <input
                type="text"
                dir={f.dir}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={f.placeholder}
                className={`${inputClass} ${f.mono ? 'font-mono tracking-wider' : ''}`}
            />
            {f.hint && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>}
        </div>
    );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
                <h2 className="font-bold">{title}</h2>
            </div>
            {children}
        </div>
    );
}

export default function PaymentInfoForm({ initial }: { initial: PlatformSettingsData }) {
    const [form, setForm] = useState<PlatformSettingsData>(initial);
    const [saving, setSaving] = useState(false);

    const set = (key: FieldKey, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
    const val = (key: FieldKey) => (form[key] ?? '') as string;

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updatePlatformSettings(form);
            if (res.success) toast.success('تم حفظ معلومات الدفع بنجاح');
            else toast.error(res.error || 'فشل الحفظ');
        } catch {
            toast.error('حدث خطأ غير متوقع');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Bank transfer + Super Key */}
            <Section icon={<Building2 className="w-5 h-5 text-primary" />} title="التحويل البنكي">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field f={{ key: 'bankName', label: 'اسم البنك', placeholder: 'مثال: بنك الرافدين' }} value={val('bankName')} onChange={(v) => set('bankName', v)} />
                    <Field f={{ key: 'accountHolder', label: 'اسم صاحب الحساب', placeholder: 'مثال: شركة فاراماس للتقنية' }} value={val('accountHolder')} onChange={(v) => set('accountHolder', v)} />
                    <Field f={{ key: 'accountNumber', label: 'رقم الحساب', placeholder: 'XXXX-XXXX-XXXX-XXXX', dir: 'ltr', mono: true, wide: true }} value={val('accountNumber')} onChange={(v) => set('accountNumber', v)} />
                    <Field f={{ key: 'superKeyPhone', label: 'دفع عن طريق سوبر كي — رقم التلفون', placeholder: '+9647XXXXXXXXX', dir: 'ltr', wide: true, hint: 'حساب سوبر كي مرتبط بنفس حساب المصرف.' }} value={val('superKeyPhone')} onChange={(v) => set('superKeyPhone', v)} />
                </div>
            </Section>

            {/* ZainCash */}
            <Section icon={<Smartphone className="w-5 h-5 text-primary" />} title="زين كاش">
                <Field f={{ key: 'zainCashNumber', label: 'رقم حساب زين كاش', placeholder: '+9647XXXXXXXXX', dir: 'ltr' }} value={val('zainCashNumber')} onChange={(v) => set('zainCashNumber', v)} />
            </Section>

            {/* Support + note */}
            <Section icon={<PhoneCall className="w-5 h-5 text-primary" />} title="الدعم والتعليمات">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field f={{ key: 'supportPhone', label: 'رقم واتساب الدعم', placeholder: '+9647XXXXXXXXX', dir: 'ltr', hint: 'يُذكر للعميل لإرسال صورة التحويل.' }} value={val('supportPhone')} onChange={(v) => set('supportPhone', v)} />
                    <Field f={{ key: 'supportEmail', label: 'البريد الإلكتروني للدعم', placeholder: 'support@example.com', dir: 'ltr' }} value={val('supportEmail')} onChange={(v) => set('supportEmail', v)} />
                    <Field f={{ key: 'workingHours', label: 'ساعات العمل', placeholder: 'مثال: 9 صباحاً – 5 مساءً', wide: true }} value={val('workingHours')} onChange={(v) => set('workingHours', v)} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">ملاحظة إضافية (اختياري)</label>
                    <textarea
                        rows={3}
                        value={form.transferNote ?? ''}
                        onChange={(e) => set('transferNote', e.target.value)}
                        placeholder="مثال: بعد إرسال الإيصال، سيتم تفعيل الاشتراك خلال ساعات العمل."
                        className={inputClass}
                    />
                </div>
            </Section>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
            </div>
        </div>
    );
}
