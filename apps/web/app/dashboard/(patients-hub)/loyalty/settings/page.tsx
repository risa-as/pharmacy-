"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Gift, ToggleLeft, ToggleRight, GitBranch, ArrowRight, Coins, CheckCircle2, Award } from "lucide-react";
import Link from "next/link";

interface Branch { id: string; name: string; loyaltyEnabled: boolean; }

export default function LoyaltySettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [settings, setSettings] = useState({
        loyaltyEnabled: false,
        loyaltyPointsPerDinar: 0.01,
        loyaltyRedemptionValue: 2.5,
        loyaltyMinRedemption: 500,
    });
    const [branches, setBranches] = useState<Branch[]>([]);
    const [togglingBranch, setTogglingBranch] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/loyalty").then((r) => r.json()),
            fetch("/api/loyalty/branches").then((r) => r.json()),
        ]).then(([data, branchData]) => {
            setSettings(data);
            setBranches(Array.isArray(branchData) ? branchData : []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const toggleBranch = async (branchId: string, enabled: boolean) => {
        setTogglingBranch(branchId);
        try {
            const res = await fetch("/api/loyalty/branches", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ branchId, loyaltyEnabled: enabled }),
            });
            if (!res.ok) throw new Error("server error");
            const updated: Branch = await res.json();
            setBranches((prev) => prev.map((b) => b.id === branchId ? { ...b, loyaltyEnabled: updated.loyaltyEnabled } : b));
        } catch {
            alert("فشل تحديث إعداد الفرع");
        } finally {
            setTogglingBranch(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch("/api/loyalty", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            if (!res.ok) throw new Error("server error");
            const updated = await res.json();
            setSettings(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            alert("فشل حفظ الإعدادات");
        }
        setSaving(false);
    };

    const pointsPer1000 = Math.round(settings.loyaltyPointsPerDinar * 1000);
    const minRedeemValue = settings.loyaltyMinRedemption * settings.loyaltyRedemptionValue;

    if (loading) {
        return (
            <div className="w-full flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Settings className="w-6 h-6 text-primary" />
                        إعدادات برنامج الولاء
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">تحكّم في معدّل كسب النقاط، قيمتها، وشروط الاستبدال</p>
                </div>
                <Link
                    href="/dashboard/loyalty"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-muted transition-colors"
                >
                    <ArrowRight className="w-4 h-4" />
                    لوحة الولاء
                </Link>
            </div>

            {/* تفعيل/تعطيل */}
            <div className={`glass-card p-6 transition-all ${settings.loyaltyEnabled ? "ring-1 ring-success/30" : ""}`}>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="font-bold text-lg text-foreground mb-1">تفعيل برنامج الولاء</h2>
                        <p className="text-sm text-muted-foreground">عند التفعيل، سيكسب المرضى نقاطاً تلقائياً مع كل عملية بيع</p>
                    </div>
                    <button
                        onClick={() => setSettings({ ...settings, loyaltyEnabled: !settings.loyaltyEnabled })}
                        className="transition-transform hover:scale-110 shrink-0"
                        aria-label="تبديل تفعيل البرنامج"
                    >
                        {settings.loyaltyEnabled ? (
                            <ToggleRight className="w-12 h-12 text-success" />
                        ) : (
                            <ToggleLeft className="w-12 h-12 text-muted-foreground" />
                        )}
                    </button>
                </div>
            </div>

            {/* تفعيل حسب الفرع */}
            {branches.length > 1 && (
                <div className="glass-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <GitBranch className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground font-cairo leading-tight">تفعيل الولاء حسب الفرع</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                يجب تفعيل البرنامج على مستوى المنشأة أولاً، ثم تحديد الفروع المشاركة.
                            </p>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        {branches.map((branch) => (
                            <div
                                key={branch.id}
                                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${branch.loyaltyEnabled ? "bg-success/10 border-success/30" : "bg-muted/40 border-border"}`}
                            >
                                <div>
                                    <div className="font-bold text-foreground">{branch.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {branch.loyaltyEnabled ? "مفعّل — يكسب الزبائن نقاطاً في هذا الفرع" : "معطّل — لا تُمنح نقاط في هذا الفرع"}
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleBranch(branch.id, !branch.loyaltyEnabled)}
                                    disabled={togglingBranch === branch.id || !settings.loyaltyEnabled}
                                    title={!settings.loyaltyEnabled ? "فعّل البرنامج على مستوى المنشأة أولاً" : undefined}
                                    className="transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                >
                                    {branch.loyaltyEnabled ? (
                                        <ToggleRight className="w-12 h-12 text-success" />
                                    ) : (
                                        <ToggleLeft className="w-12 h-12 text-muted-foreground" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* قواعد النقاط */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Coins className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h2 className="font-bold text-foreground font-cairo leading-tight">قواعد كسب واستبدال النقاط</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">المعادلات التي تحكم احتساب نقاط الزبائن</p>
                    </div>
                </div>
                <div className="p-5 space-y-6">
                    {/* Points per dinar */}
                    <div>
                        <label className="block font-bold text-foreground mb-2">
                            معدل كسب النقاط (عدد النقاط لكل 1,000 د.ع)
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="number"
                                value={pointsPer1000}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        loyaltyPointsPerDinar: parseInt(e.target.value || "10") / 1000,
                                    })
                                }
                                className="w-32 rounded-lg border border-border bg-background text-foreground px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                min={1}
                                max={100}
                            />
                            <span className="text-muted-foreground">نقطة لكل 1,000 د.ع</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            مثال: زبون يشتري بـ 30,000 د.ع ← يكسب <strong className="text-foreground">{30 * pointsPer1000}</strong> نقطة
                        </p>
                    </div>

                    {/* Redemption value */}
                    <div>
                        <label className="block font-bold text-foreground mb-2">
                            قيمة كل نقطة عند الاستبدال (بالدينار العراقي)
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="number"
                                value={settings.loyaltyRedemptionValue}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        loyaltyRedemptionValue: parseFloat(e.target.value || "2.5"),
                                    })
                                }
                                className="w-32 rounded-lg border border-border bg-background text-foreground px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                min={0.5}
                                max={50}
                                step={0.5}
                            />
                            <span className="text-muted-foreground">د.ع لكل نقطة</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            نسبة الاسترجاع الفعلية: <strong className="text-foreground">{((pointsPer1000 * settings.loyaltyRedemptionValue) / 1000 * 100).toFixed(1)}%</strong> من قيمة المشتريات
                        </p>
                    </div>

                    {/* Min redemption */}
                    <div>
                        <label className="block font-bold text-foreground mb-2">
                            الحد الأدنى لاستبدال النقاط
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="number"
                                value={settings.loyaltyMinRedemption}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        loyaltyMinRedemption: parseInt(e.target.value || "500"),
                                    })
                                }
                                className="w-32 rounded-lg border border-border bg-background text-foreground px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                min={10}
                                max={10000}
                                step={50}
                            />
                            <span className="text-muted-foreground">نقطة</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            عند الوصول لـ {settings.loyaltyMinRedemption} نقطة ← يحصل على خصم <strong className="text-foreground">{minRedeemValue.toLocaleString()} د.ع</strong>
                        </p>
                    </div>
                </div>
            </div>

            {/* معاينة تجربة الزبون */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
                        <Gift className="w-4 h-4 text-info" />
                    </div>
                    <div>
                        <h2 className="font-bold text-foreground font-cairo leading-tight">معاينة تجربة الزبون</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">كيف ستبدو المكافآت بالإعدادات الحالية</p>
                    </div>
                </div>
                <div className="p-5">
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm text-foreground">
                        <p>📱 الزبون يشتري بـ <strong>50,000 د.ع</strong></p>
                        <p>⭐ يكسب <strong className="text-info">{50 * pointsPer1000} نقطة</strong></p>
                        <p>🏪 بعد <strong>{Math.ceil(settings.loyaltyMinRedemption / (50 * pointsPer1000))} زيارة</strong> مشابهة ← يستطيع استبدال {settings.loyaltyMinRedemption} نقطة</p>
                        <p>🎁 يحصل على خصم <strong className="text-success">{minRedeemValue.toLocaleString()} د.ع</strong></p>
                        <p className="text-muted-foreground text-xs mt-2">الأعضاء الفضيون يكسبون 1.5× والذهبيون 2× النقاط!</p>
                    </div>
                </div>
            </div>

            {/* زر الحفظ */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-lg shadow-sm transition-all disabled:opacity-50"
            >
                {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-foreground border-t-transparent" />
                ) : (
                    <Save className="w-5 h-5" />
                )}
                {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </button>

            {saved && (
                <div className="flex items-center justify-center gap-2 bg-success/10 text-success rounded-xl p-4 text-center font-bold animate-fade-in">
                    <CheckCircle2 className="w-5 h-5" />
                    تم حفظ الإعدادات بنجاح!
                </div>
            )}

            {/* نظام الطبقات */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4 text-warning" />
                    </div>
                    <div>
                        <h2 className="font-bold text-foreground font-cairo leading-tight">نظام الطبقات (Tiers)</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">تترقّى الطبقة تلقائياً حسب إجمالي النقاط المجموعة</p>
                    </div>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl p-4 border border-warning/20 bg-warning/10 text-center">
                        <div className="text-3xl mb-2">🥉</div>
                        <div className="font-bold text-warning">برونزي</div>
                        <div className="text-sm text-muted-foreground">عند التسجيل</div>
                        <div className="text-xs text-warning mt-2 font-bold">1× نقاط</div>
                    </div>
                    <div className="rounded-xl p-4 border border-border bg-muted/40 text-center">
                        <div className="text-3xl mb-2">🥈</div>
                        <div className="font-bold text-foreground">فضي</div>
                        <div className="text-sm text-muted-foreground">5,000+ نقطة مجموعة</div>
                        <div className="text-xs text-muted-foreground mt-2 font-bold">1.5× نقاط</div>
                    </div>
                    <div className="rounded-xl p-4 border border-amber-300 bg-amber-100 text-center">
                        <div className="text-3xl mb-2">🥇</div>
                        <div className="font-bold text-amber-700">ذهبي</div>
                        <div className="text-sm text-amber-700/70">20,000+ نقطة مجموعة</div>
                        <div className="text-xs text-amber-700 mt-2 font-bold">2× نقاط</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
