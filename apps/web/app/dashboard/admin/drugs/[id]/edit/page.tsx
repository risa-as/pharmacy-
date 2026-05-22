import Link from "next/link";
import { Globe, ArrowRight } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";
import AdminDrugForm from "@/app/ui/admin/drugs/drug-form";

export default async function EditGlobalDrugPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const drug = await prisma.globalDrug.findUnique({ where: { id } });
    if (!drug) notFound();

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <Link href="/dashboard/admin/drugs" className="hover:text-foreground transition-colors flex items-center gap-1">
                    <Globe className="w-4 h-4" />
                    قاعدة الأدوية العالمية
                </Link>
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span className="text-foreground font-medium">تعديل دواء</span>
            </div>

            <div className="glass-card p-6">
                <h1 className="text-xl font-bold font-cairo text-foreground mb-1">تعديل: {drug.tradeName}</h1>
                <p className="text-sm text-muted-foreground mb-6 font-mono" dir="ltr">{drug.barcode}</p>
                <AdminDrugForm
                    mode="edit"
                    drug={{
                        id: drug.id,
                        barcode: drug.barcode,
                        tradeName: drug.tradeName,
                        scientificName: drug.scientificName,
                        origin: drug.origin,
                        isActive: drug.isActive,
                    }}
                    cancelHref="/dashboard/admin/drugs"
                />
            </div>
        </div>
    );
}
