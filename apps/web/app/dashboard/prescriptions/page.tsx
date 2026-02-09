import { PrismaClient } from "@prisma/client";
import { FileText, Plus, Clock, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { UpdatePrescription, DeletePrescription, CancelPrescription } from "@/app/ui/prescriptions/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function PrescriptionsPage() {
    const prescriptions = await prisma.prescription.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            patient: true,
            items: true,
        },
    });

    const statusColors: Record<string, string> = {
        PENDING: "bg-yellow-100 text-yellow-700",
        PARTIALLY_DISPENSED: "bg-blue-100 text-blue-700",
        DISPENSED: "bg-green-100 text-green-700",
        CANCELLED: "bg-red-100 text-red-700",
    };

    const statusLabels: Record<string, string> = {
        PENDING: "معلقة",
        PARTIALLY_DISPENSED: "صرف جزئي",
        DISPENSED: "تم الصرف",
        CANCELLED: "ملغاة",
    };

    const pending = prescriptions.filter(p => p.status === "PENDING").length;
    const dispensed = prescriptions.filter(p => p.status === "DISPENSED").length;

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <FileText className="w-7 h-7 text-blue-600" />
                    الوصفات الطبية
                </h1>
                <Link
                    href="/dashboard/prescriptions/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    وصفة جديدة
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{prescriptions.length}</div>
                    <div className="text-sm text-gray-500">إجمالي الوصفات</div>
                </div>
                <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                    <div className="text-3xl font-bold text-yellow-600">{pending}</div>
                    <div className="text-sm text-yellow-600">معلقة</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{dispensed}</div>
                    <div className="text-sm text-green-600">تم صرفها</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">
                        {prescriptions.reduce((acc, p) => acc + p.items.length, 0)}
                    </div>
                    <div className="text-sm text-blue-600">إجمالي الأصناف</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {prescriptions.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد وصفات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
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
                                <tr key={prescription.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/prescriptions/${prescription.id}`}
                                            className="font-bold text-blue-600 hover:underline"
                                        >
                                            {prescription.patient.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {prescription.doctorName || "-"}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
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
