"use client";

// Feature 2: نموذج تغيير كلمة المرور (كما كان). المرحلة 5 (الصقل التجاري)
// §Part 5: نموذج تعديل الملف التجاري (canEditProfile فقط — الخادم يتحقق
// مجدداً عبر canChangeSettings) + نسبة التلبية للقراءة فقط. بانر خطأ/نجاح
// داخل الصفحة (وليس toast) لنموذج كلمة المرور — نفس تعليق UsersClient.tsx؛
// نموذج الملف التجاري يستخدم sonner (toast) مثل بقية صفحات البوابة.
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, AlertTriangle, Check, KeyRound, Building2, TrendingUp } from "lucide-react";
import PageHeader from "@/app/warehouse/_components/PageHeader";

interface ProfileForm {
    name: string;
    phone: string;
    address: string;
    city: string;
    contactPerson: string;
    email: string;
    notes: string;
}

interface FulfilmentRate {
    fullyFilled: number;
    partial: number;
    outOfStock: number;
    totalLines: number;
    ratePercent: number;
}

const inputClass =
    "w-full rounded-lg border bg-muted px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-colors";

const labelClass = "mb-1.5 block text-sm font-medium text-muted-foreground";

// بطاقة قسم موحّدة: رأس (أيقونة + عنوان + وصف اختياري) ثم المحتوى، وتذييل
// اختياري خلف فاصل يحمل زر الحفظ. الغرض أن تتشارك الأقسام الثلاثة نفس
// الإيقاع بدل أن يبني كلٌّ منها حوافه وحشوه بنفسه.
function SectionCard({
    icon: Icon,
    title,
    description,
    children,
    footer,
}: {
    icon: typeof Building2;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    return (
        <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="border-b bg-muted/30 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                    </span>
                    {title}
                </h3>
                {description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
            </div>
            <div className="p-5">{children}</div>
            {footer && <div className="flex justify-end border-t bg-muted/20 px-5 py-3">{footer}</div>}
        </section>
    );
}

export default function WarehouseSettingsPage({
    canEditProfile,
    initialProfile,
    fulfilment,
}: {
    canEditProfile: boolean;
    initialProfile: ProfileForm;
    fulfilment: FulfilmentRate;
}) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [done, setDone] = useState(false);

    const [profile, setProfile] = useState<ProfileForm>(initialProfile);
    const [profileSaving, setProfileSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        setErrors([]);
        setDone(false);
        try {
            const res = await fetch("/api/warehouse-portal/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErrors(Array.isArray(data.errors) ? data.errors : [data.error ?? "حدث خطأ غير متوقع"]);
                return;
            }
            setDone(true);
            setCurrentPassword("");
            setNewPassword("");
            setShowCurrent(false);
            setShowNew(false);
        } catch (e) {
            console.error("Failed to change password:", e);
            setErrors(["تعذر الاتصال بالسيرفر"]);
        } finally {
            setSaving(false);
        }
    };

    const saveProfile = async () => {
        setProfileSaving(true);
        try {
            const res = await fetch("/api/warehouse-portal/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profile),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر حفظ بيانات المذخر");
                return;
            }
            toast.success("تم حفظ الملف التجاري");
        } catch (e) {
            console.error("Failed to save warehouse profile:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        } finally {
            setProfileSaving(false);
        }
    };

    // الشريط المكدّس يقسّم البنود الثلاثة على إجمالي الأسطر. بلا طلبات لا معنى
    // لعرض 0% — فذلك يُقرأ أداءً سيئاً لا غياب بيانات، لذلك نفصل الحالتين.
    const total = fulfilment.totalLines;
    const hasData = total > 0;
    const pct = (n: number) => (hasData ? (n / total) * 100 : 0);
    const breakdown = [
        { label: "متوفر كامل", value: fulfilment.fullyFilled, bar: "bg-success", dot: "bg-success" },
        { label: "جزئي", value: fulfilment.partial, bar: "bg-warning", dot: "bg-warning" },
        { label: "نافد", value: fulfilment.outOfStock, bar: "bg-destructive", dot: "bg-destructive" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader title="الإعدادات" description="إدارة إعدادات حسابك وملف مذخرك التجاري." />

            <SectionCard
                icon={TrendingUp}
                title="نسبة التلبية (آخر 30 يوماً)"
                description="هذا ما تحكم عليك الصيدليات به عند اختيار مذخر — نسبة الأصناف المتوفرة كاملةً من كل ما طُلب منك."
            >
                {hasData ? (
                    <div className="grid gap-5 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-8">
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold tabular-nums text-success">{fulfilment.ratePercent}</span>
                            <span className="text-xl font-bold text-success">٪</span>
                        </div>

                        <div className="min-w-0">
                            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="presentation">
                                {breakdown.map((b) => (
                                    <div key={b.label} className={b.bar} style={{ width: `${pct(b.value)}%` }} />
                                ))}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                {breakdown.map((b) => (
                                    <div key={b.label} className="flex items-center gap-2 text-xs">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${b.dot}`} aria-hidden="true" />
                                        <span className="text-muted-foreground">{b.label}</span>
                                        <span className="font-bold tabular-nums text-foreground">{b.value}</span>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>من</span>
                                    <span className="font-bold tabular-nums text-foreground">{total}</span>
                                    <span>بنداً</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                        لا توجد بنود مطلوبة خلال آخر 30 يوماً بعد — تظهر نسبتك هنا بمجرد وصول أول طلب.
                    </p>
                )}
            </SectionCard>

            {canEditProfile && (
                <SectionCard
                    icon={Building2}
                    title="الملف التجاري"
                    description="هذه البيانات تظهر للصيدليات في دليل المذاخر وعلى فواتيرك."
                    footer={
                        <button
                            onClick={saveProfile}
                            disabled={profileSaving || !profile.name.trim()}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                            {profileSaving ? "جاري الحفظ..." : "حفظ الملف التجاري"}
                        </button>
                    }
                >
                    {/* شبكة من 12 عموداً: الحقول القصيرة تتقاسم الصف على الشاشات
                        العريضة بدل أن يتمدّد كلٌّ منها على عرض الصفحة كاملاً،
                        والحقول الطويلة (العنوان/الملاحظات) تأخذ الصف كله. */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                        <div className="lg:col-span-4">
                            <label className={labelClass}>اسم المذخر *</label>
                            <input
                                className={inputClass}
                                value={profile.name}
                                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-3">
                            <label className={labelClass}>الهاتف</label>
                            <input
                                className={inputClass}
                                dir="ltr"
                                value={profile.phone}
                                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-2">
                            <label className={labelClass}>المدينة</label>
                            <input
                                className={inputClass}
                                value={profile.city}
                                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-3">
                            <label className={labelClass}>مسؤول التواصل</label>
                            <input
                                className={inputClass}
                                value={profile.contactPerson}
                                onChange={(e) => setProfile({ ...profile, contactPerson: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-7">
                            <label className={labelClass}>العنوان</label>
                            <input
                                className={inputClass}
                                value={profile.address}
                                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-5">
                            <label className={labelClass}>البريد الإلكتروني</label>
                            <input
                                className={inputClass}
                                dir="ltr"
                                value={profile.email}
                                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-12">
                            <label className={labelClass}>ملاحظات</label>
                            <textarea
                                className={inputClass}
                                rows={3}
                                value={profile.notes}
                                onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                            />
                        </div>
                    </div>
                </SectionCard>
            )}

            <SectionCard
                icon={KeyRound}
                title="تغيير كلمة المرور"
                description="ستحتاج كلمة المرور الحالية للتأكيد. الحد الأدنى للجديدة 6 أحرف."
                footer={
                    <button
                        onClick={submit}
                        disabled={saving || !currentPassword || newPassword.length < 6}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        {saving ? "جاري الحفظ..." : "تغيير كلمة المرور"}
                    </button>
                }
            >
                {done && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
                        <Check className="h-4 w-4 shrink-0" />
                        <span>تم تغيير كلمة المرور بنجاح</span>
                    </div>
                )}

                {errors.length > 0 && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <ul className="space-y-1">
                            {errors.map((err, i) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* حقلان فقط — يُقيَّدان إلى ثلث العرض على الشاشات العريضة كي لا
                    يصير حقل كلمة المرور شريطاً بعرض الصفحة. */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                        <label className={labelClass}>كلمة المرور الحالية</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                className={`${inputClass} pl-10`}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                dir="ltr"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent((v) => !v)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                                tabIndex={-1}
                                aria-label={showCurrent ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                            >
                                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-4">
                        <label className={labelClass}>كلمة المرور الجديدة</label>
                        <div className="relative">
                            <input
                                type={showNew ? "text" : "password"}
                                className={`${inputClass} pl-10`}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                dir="ltr"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew((v) => !v)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                                tabIndex={-1}
                                aria-label={showNew ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                            >
                                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {newPassword.length > 0 && newPassword.length < 6 && (
                            <p className="mt-1.5 text-xs text-destructive">6 أحرف على الأقل</p>
                        )}
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
