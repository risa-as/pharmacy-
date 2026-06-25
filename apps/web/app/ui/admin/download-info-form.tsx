'use client';

import { useState } from 'react';
import { updateDownloadSettings, type DownloadSettingsData } from '@/app/lib/actions/download-settings';
import { toast } from 'sonner';
import { Loader2, Monitor, Smartphone, Save, ExternalLink } from 'lucide-react';

const inputClass =
    'w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition';

function Field({
    label, value, onChange, placeholder, dir, mono, hint,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    dir?: 'ltr';
    mono?: boolean;
    hint?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
            <input
                type="text"
                dir={dir}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`${inputClass} ${mono ? 'font-mono tracking-wide' : ''}`}
            />
            {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
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

export default function DownloadInfoForm({ initial }: { initial: DownloadSettingsData }) {
    const [form, setForm] = useState<DownloadSettingsData>(initial);
    const [saving, setSaving] = useState(false);

    const set = (key: keyof DownloadSettingsData, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateDownloadSettings(form);
            if (res.success) toast.success('تم حفظ إعدادات التنزيل بنجاح');
            else toast.error(res.error || 'فشل الحفظ');
        } catch {
            toast.error('حدث خطأ غير متوقع');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                هذه الروابط تظهر للزوار في صفحة التنزيل (faramace.com/download). اترك الحقل فارغاً للرجوع إلى القيمة الافتراضية.
            </p>

            {/* Windows */}
            <Section icon={<Monitor className="w-5 h-5 text-primary" />} title="برنامج الكاشير (Windows)">
                <Field
                    label="رابط تحميل ملف exe."
                    value={form.windowsUrl}
                    onChange={(v) => set('windowsUrl', v)}
                    placeholder="https://.../Faramace.POS.Setup.exe"
                    dir="ltr"
                    mono
                    hint="رابط مباشر للملف (مثلاً GitHub Releases)."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="رقم الإصدار" value={form.windowsVersion} onChange={(v) => set('windowsVersion', v)} placeholder="مثال: 1.0.0" dir="ltr" />
                    <Field label="حجم الملف" value={form.windowsSize} onChange={(v) => set('windowsSize', v)} placeholder="مثال: 110 MB" dir="ltr" />
                </div>
                {form.windowsUrl?.trim() && (
                    <a href={form.windowsUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> اختبار الرابط
                    </a>
                )}
            </Section>

            {/* Android */}
            <Section icon={<Smartphone className="w-5 h-5 text-primary" />} title="تطبيق الإدارة (Android APK)">
                <Field
                    label="رابط تحميل ملف APK"
                    value={form.androidUrl}
                    onChange={(v) => set('androidUrl', v)}
                    placeholder="https://.../Faramace-mobile.apk"
                    dir="ltr"
                    mono
                    hint="رابط مباشر لملف APK."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="رقم الإصدار" value={form.androidVersion} onChange={(v) => set('androidVersion', v)} placeholder="مثال: 1.0.0" dir="ltr" />
                    <Field label="حجم الملف" value={form.androidSize} onChange={(v) => set('androidSize', v)} placeholder="مثال: 110 MB" dir="ltr" />
                </div>
                {form.androidUrl?.trim() && (
                    <a href={form.androidUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> اختبار الرابط
                    </a>
                )}
            </Section>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'جاري الحفظ...' : 'حفظ إعدادات التنزيل'}
                </button>
            </div>
        </div>
    );
}
