import { Settings } from "lucide-react";
import SettingsForm from "@/app/ui/settings/settings-form";
import BackupManager from "@/app/ui/settings/backup-manager";
import { getCompanySettings } from "@/app/lib/actions/settings";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
    const session = await auth();
    const role = session?.user?.role;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        redirect('/dashboard');
    }

    if (role === 'SUPER_ADMIN') {
        return (
            <div className="glass-card w-full max-w-4xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-muted rounded-xl">
                        <Settings className="w-8 h-8 text-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-cairo text-foreground">إعدادات المنصة</h1>
                        <p className="text-muted-foreground">إعدادات التحكم الخاصة بمدير النظام</p>
                    </div>
                </div>
                <div className="p-8 text-center bg-muted/30 rounded-xl border border-border">
                    <h2 className="text-lg font-bold text-foreground">إعدادات المنصة قيد التطوير</h2>
                    <p className="text-muted-foreground mt-2">عناصر التحكم العالمية للمنصة ستظهر هنا قريباً.</p>
                </div>
            </div>
        );
    }

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
