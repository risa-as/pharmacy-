import { useState } from 'react';
import { KeyRound, Shield, AlertTriangle, Loader2, CheckCircle2, Pill, ShieldAlert, WifiOff } from 'lucide-react';

// Extend Window type for the electronLicense bridge exposed by preload.ts
declare global {
    interface Window {
        electronLicense?: {
            getHardwareId: () => Promise<{ hardwareId: string | null; deviceName: string; success: boolean }>;
            activate: (payload: { licenseKey: string; hardwareId: string; deviceName?: string }) => Promise<{ ok: boolean; status: number; data: any }>;
            verify: (payload: { licenseKey: string; hardwareId: string }) => Promise<{ ok: boolean; status: number; data: any }>;
            saveTenantContext: (context: { organizationId: string; organizationName: string; branchId: string; branchName: string }) => Promise<{ success: boolean }>;
        };
    }
}

export type SubscriptionLockReason =
    | 'grace'
    | 'suspended'
    | 'clock-tampered'
    | 'offline-limit-exceeded'
    | 'invalid-token';

interface LicenseScreenProps {
    onActivated: () => void;
    errorMessage?: string | null;
    /** When set, shows the subscription lock screen instead of license entry. */
    subscriptionLockReason?: SubscriptionLockReason | null;
    /** Called when the user clicks "retry online check" */
    onRetryOnlineCheck?: () => void;
}

const LOCK_MESSAGES: Record<SubscriptionLockReason, string> = {
    grace: 'انتهى اشتراكك. النظام في وضع القراءة فقط. يرجى تجديد الاشتراك للاستمرار.',
    suspended: 'تم إيقاف اشتراكك. لا يمكن استخدام النظام حتى يتم إعادة تفعيل الاشتراك.',
    'clock-tampered': 'تم اكتشاف تلاعب في ساعة النظام. الرجاء تصحيح التاريخ والوقت وإعادة التشغيل.',
    'offline-limit-exceeded': 'تجاوزت الحد الأقصى للعمل دون اتصال (14 يومًا). يرجى الاتصال بالإنترنت لتجديد الاشتراك.',
    'invalid-token': 'تعذر التحقق من حالة الاشتراك. الرجاء الاتصال بالإنترنت لإعادة التحقق.',
};

type ActivationState = 'idle' | 'loading' | 'success' | 'error';

export default function LicenseScreen({ onActivated, errorMessage, subscriptionLockReason, onRetryOnlineCheck }: LicenseScreenProps) {
    const [licenseKey, setLicenseKey] = useState('');
    const [state, setState] = useState<ActivationState>(errorMessage ? 'error' : 'idle');
    const [message, setMessage] = useState(errorMessage || '');

    const handleActivate = async () => {
        const trimmedKey = licenseKey.trim();
        if (!trimmedKey) {
            setState('error');
            setMessage('الرجاء إدخال مفتاح الترخيص');
            return;
        }

        setState('loading');
        setMessage('');

        try {
            // 1. Get hardware identity from Electron main process via IPC
            const identity = await window.electronLicense?.getHardwareId();

            if (!identity?.success || !identity.hardwareId) {
                setState('error');
                setMessage('فشل في قراءة معرّف الجهاز. الرجاء إعادة تشغيل التطبيق.');
                return;
            }

            // 2. Send activation request via IPC (main process handles the network call)
            const result = await window.electronLicense?.activate({
                licenseKey: trimmedKey,
                hardwareId: identity.hardwareId,
                deviceName: identity.deviceName,
            });

            if (!result) {
                setState('error');
                setMessage('فشل الاتصال بنظام الترخيص. الرجاء إعادة تشغيل التطبيق.');
                return;
            }

            const { ok, data } = result;

            if (ok && data.success) {
                setState('success');
                setMessage('تم تفعيل الترخيص بنجاح! جاري تحميل النظام...');

                // Save license key locally for future verification
                localStorage.setItem('faramace_license_key', trimmedKey);

                // Save tenant context (org + branch) to electron-store
                if (data.organizationId && data.branchId) {
                    await window.electronLicense?.saveTenantContext({
                        organizationId: data.organizationId,
                        organizationName: data.organizationName || '',
                        branchId: data.branchId,
                        branchName: data.branchName || '',
                    });
                }

                setTimeout(() => {
                    onActivated();
                }, 1500);
            } else {
                setState('error');
                // Map English error messages to Arabic for better UX
                if (data.error === 'SERVER_UNREACHABLE') {
                    setMessage('تعذر الاتصال بالسيرفر. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
                } else if (data.error?.includes('Hardware Mismatch')) {
                    setMessage('هذا المفتاح مرتبط بجهاز آخر. تواصل مع الدعم الفني لنقل الترخيص.');
                } else if (data.error?.includes('expired') || data.error?.includes('inactive')) {
                    setMessage('الترخيص منتهي الصلاحية أو معطّل. الرجاء تجديد الاشتراك.');
                } else if (data.error?.includes('not found')) {
                    setMessage('مفتاح الترخيص غير صحيح. تأكد من إدخاله بشكل صحيح.');
                } else {
                    setMessage(data.error || 'حدث خطأ غير متوقع أثناء التفعيل');
                }
            }
        } catch (error) {
            setState('error');
            setMessage('حدث خطأ غير متوقع. الرجاء إعادة تشغيل التطبيق.');
            console.error('License activation error:', error);
        }
    };

    // ── Subscription lock screen (separate from license entry flow) ──────────
    if (subscriptionLockReason) {
        const isTampered = subscriptionLockReason === 'clock-tampered';
        return (
            <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4">
                <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/60 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
                    <div className="mx-auto mb-4 w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center">
                        {isTampered ? (
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        ) : (
                            <ShieldAlert className="w-8 h-8 text-red-400" />
                        )}
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">الاشتراك موقوف</h1>
                    <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                        {LOCK_MESSAGES[subscriptionLockReason]}
                    </p>
                    {onRetryOnlineCheck && (
                        <button
                            onClick={onRetryOnlineCheck}
                            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl transition-all"
                        >
                            <WifiOff className="w-4 h-4" />
                            الاتصال بالإنترنت للتحديث
                        </button>
                    )}
                    <p className="mt-4 text-zinc-600 text-xs">تواصل مع الدعم الفني للمساعدة</p>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Glass Card */}
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/60 rounded-2xl shadow-2xl shadow-black/40 p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/30">
                            <Pill className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">Faramace</h1>
                        <p className="text-zinc-400 text-sm">نظام إدارة الصيدليات المتكامل</p>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex-1 h-px bg-zinc-800" />
                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                            <Shield className="w-3.5 h-3.5" />
                            <span>تفعيل الترخيص</span>
                        </div>
                        <div className="flex-1 h-px bg-zinc-800" />
                    </div>

                    {/* License Key Input */}
                    <div className="mb-4">
                        <label htmlFor="license-key" className="block text-sm font-medium text-zinc-300 mb-2">
                            مفتاح الترخيص
                        </label>
                        <div className="relative">
                            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                id="license-key"
                                type="text"
                                value={licenseKey}
                                onChange={(e) => {
                                    setLicenseKey(e.target.value);
                                    if (state === 'error') setState('idle');
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                disabled={state === 'loading' || state === 'success'}
                                className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl py-3 pr-10 pl-4 text-white placeholder:text-zinc-600 text-left font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 disabled:opacity-50"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    {/* Status Message */}
                    {message && (
                        <div className={`mb-4 p-3 rounded-xl text-sm flex items-start gap-2 ${state === 'error'
                            ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                            : state === 'success'
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                            }`}>
                            {state === 'error' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            {state === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
                            <span>{message}</span>
                        </div>
                    )}

                    {/* Activate Button */}
                    <button
                        onClick={handleActivate}
                        disabled={state === 'loading' || state === 'success' || !licenseKey.trim()}
                        className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/25 hover:shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {state === 'loading' ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>جاري التحقق...</span>
                            </>
                        ) : state === 'success' ? (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>تم التفعيل</span>
                            </>
                        ) : (
                            <>
                                <Shield className="w-4 h-4" />
                                <span>تفعيل الترخيص</span>
                            </>
                        )}
                    </button>

                    {/* Footer */}
                    <p className="mt-6 text-center text-zinc-600 text-xs">
                        تواصل مع الدعم الفني في حال واجهتك أي مشكلة
                    </p>
                </div>
            </div>
        </div>
    );
}
