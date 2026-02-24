import { Settings } from "lucide-react";
import SettingsForm from "@/app/ui/settings/settings-form";
import BackupManager from "@/app/ui/settings/backup-manager";
import { getCompanySettings } from "@/app/lib/actions/settings";

export default async function SettingsPage() {
    const settings = await getCompanySettings();

    return (
        <div className="glass-card w-full max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-muted rounded-xl">
                    <Settings className="w-8 h-8 text-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground">إعدادات النظام</h1>
                    <p className="text-muted-foreground">تخصيص معلومات المؤسسة وإدارة النسخ الاحتياطي</p>
                </div>
            </div>

            <SettingsForm initialSettings={settings} />

            <BackupManager />
        </div>
    );
}
