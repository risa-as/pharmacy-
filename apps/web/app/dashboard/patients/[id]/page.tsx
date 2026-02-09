import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
    User,
    Phone,
    Calendar,
    AlertCircle,
    Heart,
    FileText,
    Building2,
    ArrowRight,
    Plus
} from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function PatientDetailsPage({ params }: { params: { id: string } }) {
    const patient = await prisma.patient.findUnique({
        where: { id: params.id },
        include: {
            prescriptions: {
                orderBy: { createdAt: "desc" },
                include: { items: true },
            },
            insurancePolicies: {
                include: { company: true },
            },
        },
    });

    if (!patient) {
        notFound();
    }

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

    return (
        <div className="w-full" suppressHydrationWarning>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                        <User className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{patient.name}</h1>
                        <p className="text-gray-500 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <span dir="ltr">{patient.phone}</span>
                        </p>
                    </div>
                </div>
                <Link
                    href="/dashboard/patients"
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                    <ArrowRight className="w-5 h-5" />
                    العودة
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* معلومات المريض */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">المعلومات الأساسية</h3>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-gray-400" />
                            <div>
                                <span className="text-xs text-gray-400">تاريخ الميلاد</span>
                                <p className="font-bold" suppressHydrationWarning>
                                    {patient.dateOfBirth
                                        ? new Date(patient.dateOfBirth).toLocaleDateString("ar-IQ")
                                        : "غير محدد"
                                    }
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-gray-400" />
                            <div>
                                <span className="text-xs text-gray-400">الجنس</span>
                                <p className="font-bold">
                                    {patient.gender === "male" ? "ذكر" : patient.gender === "female" ? "أنثى" : "غير محدد"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* الحساسية */}
                    {patient.allergies.length > 0 && (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 text-red-600 mb-2">
                                <AlertCircle className="w-5 h-5" />
                                <span className="font-bold">الحساسية</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {patient.allergies.map((allergy, i) => (
                                    <span key={i} className="px-2 py-1 bg-red-50 text-red-700 rounded-lg text-sm font-bold">
                                        {allergy}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* الأمراض المزمنة */}
                    {patient.chronicDiseases.length > 0 && (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 text-yellow-600 mb-2">
                                <Heart className="w-5 h-5" />
                                <span className="font-bold">الأمراض المزمنة</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {patient.chronicDiseases.map((disease, i) => (
                                    <span key={i} className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded-lg text-sm font-bold">
                                        {disease}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ملاحظات */}
                    {patient.notes && (
                        <div className="mt-6 p-3 bg-gray-50 rounded-lg">
                            <span className="text-xs text-gray-400">ملاحظات</span>
                            <p className="text-sm text-gray-700">{patient.notes}</p>
                        </div>
                    )}
                </div>

                {/* التأمين */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
                            التأمين الصحي
                        </h3>
                    </div>

                    {patient.insurancePolicies.length === 0 ? (
                        <div className="text-center text-gray-400 py-6">
                            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p>لا توجد بوليصات تأمين</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {patient.insurancePolicies.map((policy) => (
                                <div key={policy.id} className="p-3 bg-blue-50 rounded-lg">
                                    <div className="font-bold text-blue-800">{policy.company.name}</div>
                                    <div className="text-sm text-blue-600">
                                        رقم البوليصة: {policy.policyNumber}
                                    </div>
                                    <div className="text-sm text-blue-600">
                                        نسبة التغطية: {policy.coverageRate}%
                                    </div>
                                    <div className="text-xs text-blue-500 mt-1" suppressHydrationWarning>
                                        تنتهي: {new Date(policy.expiryDate).toLocaleDateString("ar-IQ")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* الوصفات */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            الوصفات الطبية
                        </h3>
                        <Link
                            href={`/dashboard/prescriptions/create?patientId=${patient.id}`}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                        >
                            <Plus className="w-4 h-4" />
                            وصفة جديدة
                        </Link>
                    </div>

                    {patient.prescriptions.length === 0 ? (
                        <div className="text-center text-gray-400 py-6">
                            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p>لا توجد وصفات مسجلة</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            {patient.prescriptions.map((prescription) => (
                                <div key={prescription.id} className="p-3 border rounded-lg hover:bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-500" suppressHydrationWarning>
                                            {new Date(prescription.createdAt).toLocaleDateString("ar-IQ")}
                                        </span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColors[prescription.status]}`}>
                                            {statusLabels[prescription.status]}
                                        </span>
                                    </div>
                                    <div className="text-sm font-bold text-gray-700 mt-1">
                                        {prescription.items.length} صنف
                                    </div>
                                    {prescription.doctorName && (
                                        <div className="text-xs text-gray-400">
                                            د. {prescription.doctorName}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
