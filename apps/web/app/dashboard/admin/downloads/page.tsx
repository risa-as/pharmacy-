export const dynamic = "force-dynamic";

import { getDownloadSettings } from "@/app/lib/actions/download-settings";
import DownloadInfoForm from "@/app/ui/admin/download-info-form";

export default async function DownloadsPage() {
    const downloadSettings = await getDownloadSettings();

    return (
        <div className="w-full max-w-3xl mx-auto" dir="rtl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">إعدادات التنزيل</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    روابط تحميل البرنامج (exe) والتطبيق (APK) التي تظهر في صفحة التنزيل العامة (faramace.com/download).
                    يمكنك لصق رابط مباشر من GitHub Releases أو أي مصدر آخر.
                </p>
            </div>
            <DownloadInfoForm initial={downloadSettings} />
        </div>
    );
}
