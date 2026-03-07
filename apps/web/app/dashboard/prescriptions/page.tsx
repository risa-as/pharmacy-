import { prisma } from "@/app/lib/prisma";
import { FileText, Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { UpdatePrescription, DeletePrescription, CancelPrescription } from "@/app/ui/prescriptions/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


export default async function PrescriptionsPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const prescriptions = await prisma.prescription.findMany({
        where: {
            patient: tenantBranchWhere
        },
        orderBy: { createdAt: "desc" },
        include: {
            patient: true,
            items: true,
        },
    });

    const statusColors: Record<string, string> = {
        PENDING: "bg-warning/20 text-warning",
        PARTIALLY_DISPENSED: "bg-primary/10 text-primary",
        DISPENSED: "bg-success/10 text-success",
        CANCELLED: "bg-destructive/10 text-destructive",
    };

    const statusLabels: Record<string, string> = {
        PENDING: "معلقة",
        PARTIALLY_DISPENSED: "صرف جزئي",
        DISPENSED: "تم الصرف",
        CANCELLED: "ملغاة",
    };

    const pending = prescriptions.filter((p: any) => p.status === "PENDING").length;
    const dispensed = prescriptions.filter((p: any) => p.status === "DISPENSED").length;

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <FileText className="w-7 h-7 text-primary" />
                    الوصفات الطبية
                </h1>
                <Link
                    href="/dashboard/prescriptions/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    وصفة جديدة
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{prescriptions.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي الوصفات</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
                    <div className="text-3xl font-bold text-warning">{pending}</div>
                    <div className="text-sm text-warning">معلقة</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{dispensed}</div>
                    <div className="text-sm text-success">تم صرفها</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">
                        {prescriptions.reduce((acc, p) => acc + p.items.length, 0)}
                    </div>
                    <div className="text-sm text-primary">إجمالي الأصناف</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {prescriptions.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد وصفات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">المريض</th>
                                <th className="px-4 py-3 text-right font-bold">الطبيب</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                                <th className="px-4 py-3 text-right font-bold">الأصناف</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {prescriptions.map((prescription) => (
                                <tr key={prescription.id} className="hover:bg-muted">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/prescriptions/${prescription.id}`}
                                            className="font-bold text-primary hover:underline"
                                        >
                                            {prescription.patient.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {prescription.doctorName || "-"}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                        {new Date(prescription.createdAt).toLocaleDateString("ar-IQ")}
                                    </td>
                                    <td className="px-4 py-3 font-bold">
                                        {prescription.items.length} صنف
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusColors[prescription.status]}`}>
                                            {statusLabels[prescription.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <UpdatePrescription id={prescription.id} />
                                            {prescription.status === "PENDING" && (
                                                <CancelPrescription id={prescription.id} />
                                            )}
                                            <DeletePrescription id={prescription.id} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
