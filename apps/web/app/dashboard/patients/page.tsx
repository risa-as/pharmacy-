import { PrismaClient } from "@prisma/client";
import { Users, Plus, Phone, Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";
import { UpdatePatient, DeletePatient } from "@/app/ui/patients/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function PatientsPage() {
    const patients = await prisma.patient.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            prescriptions: { take: 1, orderBy: { createdAt: "desc" } },
        },
    });

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Users className="w-7 h-7 text-blue-600" />
                    سجل المرضى
                </h1>
                <Link
                    href="/dashboard/patients/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة مريض
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{patients.length}</div>
                    <div className="text-sm text-gray-500">إجمالي المرضى</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">
                        {patients.filter(p => p.allergies.length > 0).length}
                    </div>
                    <div className="text-sm text-blue-600">لديهم حساسية</div>
                </div>
                <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                    <div className="text-3xl font-bold text-yellow-600">
                        {patients.filter(p => p.chronicDiseases.length > 0).length}
                    </div>
                    <div className="text-sm text-yellow-600">أمراض مزمنة</div>
                </div>
            </div>

            {/* جدول المرضى */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {patients.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا يوجد مرضى مسجلين</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الاسم</th>
                                <th className="px-4 py-3 text-right font-bold">الهاتف</th>
                                <th className="px-4 py-3 text-right font-bold">الجنس</th>
                                <th className="px-4 py-3 text-right font-bold">الحساسية</th>
                                <th className="px-4 py-3 text-right font-bold">الأمراض المزمنة</th>
                                <th className="px-4 py-3 text-right font-bold">آخر زيارة</th>
                                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {patients.map((patient) => (
                                <tr key={patient.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/patients/${patient.id}`}
                                            className="font-bold text-blue-600 hover:underline"
                                        >
                                            {patient.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-sm text-gray-600" dir="ltr">
                                        {patient.phone}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {patient.gender === "male" ? "ذكر" : patient.gender === "female" ? "أنثى" : "-"}
                                    </td>
                                    <td className="px-4 py-3">
                                        {patient.allergies.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                                <AlertCircle className="w-3 h-3" />
                                                {patient.allergies.length} حساسية
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {patient.chronicDiseases.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                                                {patient.chronicDiseases.length} مرض
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
                                        {patient.prescriptions[0]
                                            ? new Date(patient.prescriptions[0].createdAt).toLocaleDateString("ar-IQ")
                                            : "-"
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <UpdatePatient id={patient.id} />
                                            <DeletePatient id={patient.id} />
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
