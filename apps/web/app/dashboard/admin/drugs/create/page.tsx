import Link from "next/link";
import { Globe, ArrowRight } from "lucide-react";
import AdminDrugForm from "@/app/ui/admin/drugs/drug-form";

export default function CreateGlobalDrugPage() {
    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <Link href="/dashboard/admin/drugs" className="hover:text-foreground transition-colors flex items-center gap-1">
                    <Globe className="w-4 h-4" />
                    قاعدة الأدوية العالمية
                </Link>
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span className="text-foreground font-medium">إضافة دواء جديد</span>
            </div>

            <div className="glass-card p-6">
                <h1 className="text-xl font-bold font-cairo text-foreground mb-1">إضافة دواء عالمي جديد</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    الأدوية العالمية متاحة لجميع المنظمات في المنصة للقراءة والاستخدام في المخزون.
                </p>
                <AdminDrugForm mode="create" cancelHref="/dashboard/admin/drugs" />
            </div>
        </div>
    );
}
