import { Button } from "@faramace/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { DeleteInvoice } from "@/app/ui/invoices/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getInvoices() {
    const invoices = await prisma.purchase.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            supplier: true,
            branch: true,
            _count: { select: { items: true } }
        }
    });
    return invoices;
}

export default async function Page() {
    const invoices = await getInvoices();

    return (
        <div className="w-full">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800">فواتير الشراء</h1>
                <Button asChild className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href="/dashboard/invoices/create">
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block font-bold">إنشاء فاتورة</span>
                    </Link>
                </Button>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-gray-900">
                            <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        المورد
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الفرع
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        العناصر
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الإجمالي
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        التاريخ
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {invoices.map((invoice) => (
                                    <tr
                                        key={invoice.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <p className="font-medium text-gray-900">{invoice.supplier.name}</p>
                                                {invoice.invoiceNumber && <span className="text-xs text-gray-500">({invoice.invoiceNumber})</span>}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                                            {invoice.branch.name}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                                            {invoice._count.items}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-bold text-gray-900">
                                            {invoice.total.toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500" suppressHydrationWarning>
                                            {new Date(invoice.createdAt).toLocaleDateString('ar-EG')}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex justify-end gap-3">
                                                <DeleteInvoice id={invoice.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                                            لا توجد فواتير حتى الآن.
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
