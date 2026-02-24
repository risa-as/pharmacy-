"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Gift, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";

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

    useEffect(() => {
        fetch("/api/loyalty")
            .then((r) => r.json())
            .then((data) => {
                setSettings(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await fetch("/api/loyalty", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
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
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600" />
            </div>
        );
    }

    return (
        <div className="glass-card w-full max-w-3xl mx-auto p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <Settings className="w-7 h-7 text-indigo-600" />
                    إعدادات برنامج الولاء
                </h1>
                <Link
                    href="/dashboard/loyalty"
                    className="text-sm text-indigo-600 hover:underline font-bold"
                >
                    ← العودة للوحة الولاء
                </Link>
            </div>

            {/* Enable/Disable */}
            <div className={`p-6 rounded-2xl border-2 transition-all ${settings.loyaltyEnabled ? "bg-success/10 border-green-300" : "bg-muted border-border"}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-lg mb-1">تفعيل برنامج الولاء</h2>
                        <p className="text-sm text-muted-foreground">عند التفعيل، سيكسب المرضى نقاطاً تلقائياً مع كل عملية بيع</p>
                    </div>
                    <button
                        onClick={() => setSettings({ ...settings, loyaltyEnabled: !settings.loyaltyEnabled })}
                        className="text-3xl transition-transform hover:scale-110"
                    >
                        {settings.loyaltyEnabled ? (
                            <ToggleRight className="w-12 h-12 text-success" />
                        ) : (
                            <ToggleLeft className="w-12 h-12 text-muted-foreground" />
                        )}
                    </button>
                </div>
            </div>

            {/* Settings Form */}
            <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-6">
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
                            className="w-32 rounded-lg border border-border px-4 py-3 text-center text-xl font-bold focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                            min={1}
                            max={100}
                        />
                        <span className="text-muted-foreground">نقطة لكل 1,000 د.ع</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        مثال: زبون يشتري بـ 30,000 د.ع ← يكسب <strong>{30 * pointsPer1000}</strong> نقطة
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
                            className="w-32 rounded-lg border border-border px-4 py-3 text-center text-xl font-bold focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                            min={0.5}
                            max={50}
                            step={0.5}
                        />
                        <span className="text-muted-foreground">د.ع لكل نقطة</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        نسبة الاسترجاع الفعلية: <strong>{((pointsPer1000 * settings.loyaltyRedemptionValue) / 1000 * 100).toFixed(1)}%</strong> من قيمة المشتريات
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
                            className="w-32 rounded-lg border border-border px-4 py-3 text-center text-xl font-bold focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                            min={10}
                            max={10000}
                            step={50}
                        />
                        <span className="text-muted-foreground">نقطة</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        عند الوصول لـ {settings.loyaltyMinRedemption} نقطة ← يحصل على خصم <strong>{minRedeemValue.toLocaleString()} د.ع</strong>
                    </p>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-purple-50 rounded-2xl border border-purple-200 p-6">
                <h2 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    معاينة تجربة الزبون
                </h2>
                <div className="bg-card rounded-xl p-4 space-y-2 text-sm">
                    <p>📱 الزبون يشتري بـ <strong>50,000 د.ع</strong></p>
                    <p>⭐ يكسب <strong className="text-purple-600">{50 * pointsPer1000} نقطة</strong></p>
                    <p>🏪 بعد <strong>{Math.ceil(settings.loyaltyMinRedemption / (50 * pointsPer1000))} زيارة</strong> مشابهة ← يستطيع استبدال {settings.loyaltyMinRedemption} نقطة</p>
                    <p>🎁 يحصل على خصم <strong className="text-success">{minRedeemValue.toLocaleString()} د.ع</strong></p>
                    <p className="text-muted-foreground text-xs mt-2">الأعضاء الفضيون يكسبون 1.5× والذهبيون 2× النقاط!</p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                    {saving ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    ) : (
                        <Save className="w-5 h-5" />
                    )}
                    {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
                </button>
            </div>

            {saved && (
                <div className="bg-success/10 text-green-800 rounded-xl p-4 text-center font-bold animate-fade-in">
                    ✅ تم حفظ الإعدادات بنجاح!
                </div>
            )}

            {/* Tier Info */}
            <div className="bg-card rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold text-foreground mb-4">نظام الطبقات (Tiers)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-warning/10 rounded-xl p-4 border border-orange-200 text-center">
                        <div className="text-3xl mb-2">🥉</div>
                        <div className="font-bold text-orange-800">برونزي</div>
                        <div className="text-sm text-muted-foreground">عند التسجيل</div>
                        <div className="text-xs text-warning mt-2 font-bold">1× نقاط</div>
                    </div>
                    <div className="bg-muted rounded-xl p-4 border border-border text-center">
                        <div className="text-3xl mb-2">🥈</div>
                        <div className="font-bold text-foreground">فضي</div>
                        <div className="text-sm text-muted-foreground">5,000+ نقطة مجموعة</div>
                        <div className="text-xs text-muted-foreground mt-2 font-bold">1.5× نقاط</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-300 text-center">
                        <div className="text-3xl mb-2">🥇</div>
                        <div className="font-bold text-yellow-800">ذهبي</div>
                        <div className="text-sm text-muted-foreground">20,000+ نقطة مجموعة</div>
                        <div className="text-xs text-yellow-700 mt-2 font-bold">2× نقاط</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
