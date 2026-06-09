import { Settings, Building2, PackageOpen, Key, ShieldCheck, Gift, Shield, CreditCard, HardDrive, ChevronLeft, Bot, ScanLine } from "lucide-react";
import SettingsForm from "@/app/ui/settings/settings-form";
import BackupManager from "@/app/ui/settings/backup-manager";
import AIUsageWidget from "@/app/ui/settings/ai-usage-widget";
import ScanUsageWidget from "@/app/ui/settings/scan-usage-widget";
import { getCompanySettings } from "@/app/lib/actions/settings";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import Link from "next/link";

export default async function SettingsPage() {
    const session = await auth();
    const role = session?.user?.role;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        redirect('/dashboard');
    }

    if (role === 'SUPER_ADMIN') {
        // Load quick stats for the platform overview
        const [orgCount, planCount, licenseCount] = await Promise.all([
            prisma.organization.count(),
            prisma.subscriptionPlan.count({ where: { isActive: true } }),
            prisma.deviceLicense.count({ where: { isActive: true } }),
        ]);

        const adminLinks = [
            {
                href: '/dashboard/admin/tenants',
                icon: Building2,
                label: 'إدارة المؤسسات',
                description: 'عرض وإدارة جميع المؤسسات المسجلة',
                stat: `${orgCount} مؤسسة`,
                color: 'text-blue-500 bg-blue-500/10',
            },
            {
                href: '/dashboard/admin/plans',
                icon: PackageOpen,
                label: 'إدارة الباقات',
                description: 'تعديل الباقات وحدودها وميزاتها',
                stat: `${planCount} باقة نشطة`,
                color: 'text-amber-500 bg-amber-500/10',
            },
            {
                href: '/dashboard/admin/licenses',
                icon: Key,
                label: 'التراخيص',
                description: 'عرض تراخيص الأجهزة النشطة',
                stat: `${licenseCount} رخصة نشطة`,
                color: 'text-green-500 bg-green-500/10',
            },
        ];

        return (
            <div className="glass-card w-full max-w-4xl mx-auto p-6 space-y-6" dir="rtl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-muted rounded-xl">
                        <ShieldCheck className="w-8 h-8 text-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">لوحة تحكم المنصة</h1>
                        <p className="text-muted-foreground text-sm">وصول سريع لجميع أدوات إدارة النظام</p>
                    </div>
                </div>

                {/* Quick access cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {adminLinks.map(({ href, icon: Icon, label, description, stat, color }) => (
                        <a
                            key={href}
                            href={href}
                            className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="font-bold text-foreground group-hover:text-primary transition-colors">{label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
                            </div>
                            <div className="text-xs font-bold text-muted-foreground border-t border-border pt-2 mt-auto">
                                {stat}
                            </div>
                        </a>
                    ))}
                </div>

                {/* Info note */}
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
                    <Settings className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>إعدادات المنصة العالمية (SMTP، بوابات الدفع، إلخ) ستُضاف في تحديثات قادمة.</span>
                </div>
            </div>
        );
    }

    const settings = await getCompanySettings();

    const settingsSections = [
        {
            href: '/dashboard/loyalty/settings',
            icon: Gift,
            label: 'نظام الولاء',
            description: 'إدارة نقاط المكافآت للعملاء وإعداداتها',
            color: 'text-pink-500 bg-pink-500/10',
        },
        {
            href: '/dashboard/users/permissions',
            icon: Shield,
            label: 'صلاحيات الموظفين',
            description: 'تحديد الصلاحيات الافتراضية لكل دور',
            color: 'text-violet-500 bg-violet-500/10',
        },
        {
            href: '/dashboard/settings/billing',
            icon: CreditCard,
            label: 'الاشتراك والفوترة',
            description: 'إدارة باقتك وتجديد الاشتراك وعرض الفواتير',
            color: 'text-blue-500 bg-blue-500/10',
        },
    ];

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 bg-muted rounded-xl">
                    <Settings className="w-8 h-8 text-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground">إعدادات النظام</h1>
                    <p className="text-muted-foreground text-sm">إدارة المؤسسة والتفضيلات والباقات</p>
                </div>
            </div>

            {/* Quick links to sub-sections */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {settingsSections.map(({ href, icon: Icon, label, description, color }) => (
                    <Link
                        key={href}
                        href={href}
                        className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
                    >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-foreground group-hover:text-primary transition-colors">{label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-primary/60 group-hover:text-primary transition-colors mt-auto">
                            <span>الانتقال</span>
                            <ChevronLeft className="w-3 h-3" />
                        </div>
                    </Link>
                ))}
            </div>

            {/* General Settings Form */}
            <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-foreground">الإعدادات العامة للمؤسسة</h2>
                </div>
                <SettingsForm initialSettings={settings} />
            </div>

            {/* AI Usage */}
            <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <Bot className="w-4 h-4 text-violet-500" />
                    <h2 className="font-bold text-foreground">المساعد الذكي — الاستخدام اليومي</h2>
                </div>
                <AIUsageWidget />
            </div>

            {/* Scan Usage */}
            <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <ScanLine className="w-4 h-4 text-emerald-500" />
                    <h2 className="font-bold text-foreground">قارئ الوصفات — الاستخدام اليومي</h2>
                </div>
                <ScanUsageWidget />
            </div>

            {/* Backup */}
            <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-primary" />
                    <h2 className="font-bold text-foreground">النسخ الاحتياطي</h2>
                </div>
                <BackupManager />
            </div>
        </div>
    );
}
