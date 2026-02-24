import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Plus, Users, Mail, Phone, MapPin, FileText, DollarSign } from "lucide-react";
import { UpdateSupplier, DeleteSupplier } from "@/app/ui/suppliers/buttons";

async function getSuppliers() {
    const suppliers = await prisma.supplier.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            _count: { select: { purchases: true } }
        }
    });
    return suppliers;
}

export default async function Page() {
    const suppliers = await getSuppliers();

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Users className="w-7 h-7 text-primary" />
                    الموردين
                </h1>
                <Link
                    href="/dashboard/suppliers/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة مورد
                </Link>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                        <table className="min-w-full text-foreground">
                            <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        اسم المورد
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        معلومات الاتصال
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الرصيد المستحق
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        المشتريات
                                    </th>
                                    <th scope="col" className="relative py-3 pl-6 pr-3">
                                        <span className="sr-only">إجراءات</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-card">
                                {suppliers.map((supplier) => (
                                    <tr
                                        key={supplier.id}
                                        className="hover:bg-muted transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                                    <Users className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground">{supplier.name}</p>
                                                    {supplier.address && (
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                                            <MapPin className="w-3 h-3" />
                                                            <span>{supplier.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {supplier.email && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Mail className="w-4 h-4" />
                                                        <span>{supplier.email}</span>
                                                    </div>
                                                )}
                                                {supplier.phone && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Phone className="w-4 h-4" />
                                                        <span dir="ltr">{supplier.phone}</span>
                                                    </div>
                                                )}
                                                {!supplier.email && !supplier.phone && (
                                                    <span className="text-muted-foreground text-sm">غير متوفر</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            {supplier.balance > 0 ? (
                                                <div className="flex items-center gap-1">
                                                    <DollarSign className="w-4 h-4 text-warning" />
                                                    <span className="font-bold text-warning">
                                                        {supplier.balance.toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">د.ع</span>
                                                </div>
                                            ) : (
                                                <span className="text-success text-sm font-bold">مسدد ✓</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <span className="text-sm text-muted-foreground">
                                                {supplier._count.purchases} فاتورة
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap py-3 pl-6 pr-3">
                                            <div className="flex justify-end gap-2">
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}`}
                                                    className="rounded-lg border border-border p-2 hover:bg-primary/10 hover:border-primary transition-colors"
                                                    title="كشف حساب"
                                                >
                                                    <FileText className="w-4 h-4 text-primary" />
                                                </Link>
                                                <UpdateSupplier id={supplier.id} />
                                                <DeleteSupplier id={supplier.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {suppliers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
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
