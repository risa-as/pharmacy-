import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { Plus, Users, Mail, Phone, MapPin } from "lucide-react";
import { UpdateSupplier, DeleteSupplier } from "@/app/ui/suppliers/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getSuppliers() {
    const suppliers = await prisma.supplier.findMany({
        orderBy: { createdAt: 'desc' },
    });
    return suppliers;
}

export default async function Page() {
    const suppliers = await getSuppliers();

    return (
        <div className="w-full">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Users className="w-7 h-7 text-blue-600" />
                    الموردين
                </h1>
                <Link
                    href="/dashboard/suppliers/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة مورد
                </Link>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-gray-900">
                            <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        اسم المورد
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        معلومات الاتصال
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        العنوان
                                    </th>
                                    <th scope="col" className="relative py-3 pl-6 pr-3">
                                        <span className="sr-only">إجراءات</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {suppliers.map((supplier) => (
                                    <tr
                                        key={supplier.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                                    <Users className="w-5 h-5 text-blue-600" />
                                                </div>
                                                <p className="font-bold text-gray-800">{supplier.name}</p>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {supplier.email && (
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Mail className="w-4 h-4" />
                                                        <span>{supplier.email}</span>
                                                    </div>
                                                )}
                                                {supplier.phone && (
                                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                                        <Phone className="w-4 h-4" />
                                                        <span dir="ltr">{supplier.phone}</span>
                                                    </div>
                                                )}
                                                {!supplier.email && !supplier.phone && (
                                                    <span className="text-gray-400 text-sm">غير متوفر</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            {supplier.address ? (
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <MapPin className="w-4 h-4" />
                                                    <span>{supplier.address}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-sm">غير محدد</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap py-3 pl-6 pr-3">
                                            <div className="flex justify-end gap-2">
                                                <UpdateSupplier id={supplier.id} />
                                                <DeleteSupplier id={supplier.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {suppliers.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                                            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                            لا يوجد موردين مسجلين
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
