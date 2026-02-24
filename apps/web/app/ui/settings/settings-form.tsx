"use client";

import { useState } from "react";
import { Button } from "@faramace/ui";
import { Loader2, Save, Download, Upload, Sparkles } from "lucide-react";
import { updateCompanySettings, createBackup } from "@/app/lib/actions/settings";
import { toast } from "sonner";
import Image from "next/image";

import { UploadButton } from "@/app/lib/uploadthing";

interface SettingsFormProps {
    initialSettings: any;
}

export default function SettingsForm({ initialSettings }: SettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [logoUrl, setLogoUrl] = useState(initialSettings?.logoUrl || "");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await updateCompanySettings(formData);

        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.message);
        }

        setIsLoading(false);
    };

    const handleBackup = async () => {
        setIsBackingUp(true);
        toast.info("جاري تجهيز النسخة الاحتياطية...");

        const result = await createBackup();

        if (result.success && result.data) {
            // Create a blob and trigger download
            const blob = new Blob([result.data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = result.filename || "backup.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success("تم تحميل النسخة الاحتياطية بنجاح");
        } else {
            toast.error("فشل في إنشاء النسخة الاحتياطية");
        }

        setIsBackingUp(false);
    };

    const [isRestoring, setIsRestoring] = useState(false);

    const handleRestoreClick = () => {
        document.getElementById("restore-input")?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset value so same file can be selected again if needed
        e.target.value = "";

        if (!confirm("هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيتم دمج البيانات وتحديث السجلات الموجودة.")) {
            return;
        }

        setIsRestoring(true);
        const toastId = toast.loading("جاري استعادة البيانات...");

        try {
            const text = await file.text();
            const json = JSON.parse(text);

            const response = await fetch("/api/backup/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(json)
            });

            const result = await response.json();

            if (result.success) {
                toast.success(`تم الاستعادة بنجاح! طابق (مستخدمين: ${result.stats.users}, أدوية: ${result.stats.drugs})`, { id: toastId });
                // Optional: refresh page
                setTimeout(() => window.location.reload(), 2000);
            } else {
                toast.error("فشل الاستعادة: " + result.message, { id: toastId });
            }
        } catch (error) {
            console.error(error);
            toast.error("خطأ في قراءة ملف النسخة الاحتياطية", { id: toastId });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* General Info Section */}
            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                    <span className="w-1 h-6 bg-primary rounded-full"></span>
                    معلومات المؤسسة
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Company Name */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">اسم الصيدلية / المؤسسة</label>
                            <input
                                type="text"
                                name="name"
                                defaultValue={initialSettings?.name}
                                required
                                className="w-full rounded-lg border border-border px-4 py-2 focus:ring-2 focus:ring-ring/20 outline-none"
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">رقم الهاتف</label>
                            <input
                                type="text"
                                name="phone"
                                defaultValue={initialSettings?.phone || ""}
                                className="w-full rounded-lg border border-border px-4 py-2 focus:ring-2 focus:ring-ring/20 outline-none"
                                dir="ltr"
                            />
                        </div>

                        {/* Address */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-foreground mb-2">العنوان</label>
                            <input
                                type="text"
                                name="address"
                                defaultValue={initialSettings?.address || ""}
                                className="w-full rounded-lg border border-border px-4 py-2 focus:ring-2 focus:ring-ring/20 outline-none"
                            />
                        </div>

                        {/* Max Discount Percent */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">أقصى نسبة خصم للموظفين (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    name="maxDiscountPercent"
                                    defaultValue={initialSettings?.maxDiscountPercent ?? 10}
                                    min="0"
                                    max="100"
                                    step="1"
                                    className="w-full rounded-lg border border-border px-4 py-2 focus:ring-2 focus:ring-ring/20 outline-none"
                                    dir="ltr"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">%</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">الحد الأقصى للخصم الإضافي الذي يستطيع الموظف تطبيقه (كنسبة من إجمالي الفاتورة)</p>
                        </div>

                        {/* Currency */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">العملة</label>
                            <select
                                name="currency"
                                defaultValue={initialSettings?.currency || "IQD"}
                                className="w-full rounded-lg border border-border px-4 py-2 focus:ring-2 focus:ring-ring/20 outline-none"
                            >
                                <option value="IQD">🇮🇶 دينار عراقي (د.ع)</option>
                                <option value="USD">🇺🇸 دولار أمريكي ($)</option>
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">العملة المستخدمة في عرض الأسعار والتقارير</p>
                        </div>

                        {/* Logo Upload */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-foreground mb-2">شعار المؤسسة</label>
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className="flex-1 space-y-4 w-full">
                                    <input type="hidden" name="logoUrl" value={logoUrl} />

                                    <div className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center bg-muted hover:bg-muted transition-colors">
                                        <UploadButton
                                            endpoint="imageUploader"
                                            onClientUploadComplete={(res) => {
                                                if (res && res[0]) {
                                                    setLogoUrl(res[0].url);
                                                    toast.success("تم رفع الشعار بنجاح");
                                                }
                                            }}
                                            onUploadError={(error: Error) => {
                                                toast.error(`خطأ في الرفع: ${error.message}`);
                                            }}
                                            appearance={{
                                                button: "bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-sm font-medium ut-uploading:cursor-not-allowed",
                                                allowedContent: "text-muted-foreground text-xs mt-1"
                                            }}
                                            content={{
                                                button({ ready }) {
                                                    if (ready) return <span className="flex items-center gap-2"><Upload className="w-4 h-4" /> رفع صورة</span>;
                                                    return "جاري التحميل...";
                                                },
                                                allowedContent({ ready, fileTypes, isUploading }) {
                                                    if (!ready) return "Checking what you allow";
                                                    if (isUploading) return "جاري الرفع...";
                                                    return `الصور المسموحة: ${fileTypes.join(", ")}`;
                                                },
                                            }}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        يفضل استخدام صورة مربعة أو شفافة (PNG) للحصول على أفضل نتيجة.
                                        الحجم الأقصى: 4MB.
                                    </p>
                                </div>

                                {/* Preview */}
                                <div className="w-32 h-32 relative border rounded-xl overflow-hidden bg-muted shadow-sm shrink-0 flex items-center justify-center">
                                    {logoUrl ? (
                                        <Image
                                            src={logoUrl}
                                            alt="Logo"
                                            fill
                                            className="object-contain p-2"
                                        />
                                    ) : (
                                        <span className="text-muted-foreground text-sm p-4 text-center">لا يوجد شعار</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t flex justify-end">
                        <Button type="submit" disabled={isLoading} className="gap-2">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            حفظ الإعدادات
                        </Button>
                    </div>
                </form>
            </div>

            {/* Backup Section */}
            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-success rounded-full"></span>
                    النسخ الاحتياطي والاستعادة
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                    يمكنك تحميل نسخة كاملة من بيانات النظام أو استعادة بيانات سابقة ملف JSON.
                    عند الاستعادة، سيتم دمج البيانات الجديدة مع الموجودة وتحديث السجلات المتطابقة.
                </p>

                <div className="flex items-center gap-4">
                    <Button
                        onClick={handleBackup}
                        disabled={isBackingUp || isRestoring}
                        variant="outline"
                        className="gap-2 border-success/30 hover:bg-success/10 text-success"
                    >
                        {isBackingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        تحميل نسخة احتياطية
                    </Button>

                    <input
                        id="restore-input"
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    <Button
                        onClick={handleRestoreClick}
                        disabled={isBackingUp || isRestoring}
                        variant="default"
                        className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        استعادة نسخة (JSON)
                    </Button>
                </div>
            </div>

            {/* Onboarding Tour Section */}
            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-info rounded-full"></span>
                    الجولة التعريفية
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                    أعد عرض الجولة التعريفية للتعرف على ميزات النظام.
                </p>
                <Button
                    onClick={() => {
                        localStorage.removeItem("faramace_onboarding_completed");
                        toast.success("سيتم عرض الجولة التعريفية عند الذهاب للوحة التحكم");
                        setTimeout(() => window.location.href = "/dashboard", 1000);
                    }}
                    variant="outline"
                    className="gap-2 border-info/30 hover:bg-info/10 text-info"
                >
                    <Sparkles className="w-4 h-4" />
                    إعادة الجولة التعريفية
                </Button>
            </div>
        </div>
    );
}
