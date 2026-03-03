import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';

export default async function ReturnInvoicePage({
    params
}: {
    params: { id: string }
}) {
    const session = await auth();

    const returnData = await prisma.saleReturn.findUnique({
        where: { id: params.id },
        include: {
            items: {
                include: {
                    drug: { select: { tradeName: true, barcode: true } }
                }
            },
            sale: { select: { id: true, total: true, createdAt: true } },
            branch: { select: { name: true } }
        }
    });

    if (!returnData) notFound();

    // Get company settings for header
    const settings = await prisma.companySettings.findFirst();

    const formatDate = (d: Date) => d.toLocaleDateString('ar-IQ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });

    const fmt = (v: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(v);

    return (
        <div className="p-6" dir="rtl">
            {/* Print Button */}
            <div className="flex justify-end mb-4 print:hidden">
                <button
                    onClick={() => { if (typeof window !== 'undefined') window.print(); }}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                    🖨️ طباعة
                </button>
            </div>

            {/* Invoice */}
            <div className="max-w-2xl mx-auto bg-card border-2 border-border rounded-xl p-8 print:border-none print:shadow-none print:p-4">
                {/* Header */}
                <div className="text-center border-b-2 border-border pb-4 mb-4">
                    {settings?.logoUrl && (
                        <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain" />
                    )}
                    <h1 className="text-xl font-bold text-foreground">{settings?.name || 'الصيدلية'}</h1>
                    {settings?.address && <p className="text-sm text-muted-foreground">{settings.address}</p>}
                    {settings?.phone && <p className="text-sm text-muted-foreground">📞 {settings.phone}</p>}
                    <div className="mt-3 bg-destructive/10 border border-red-200 rounded-lg py-2">
                        <h2 className="text-lg font-bold text-destructive">🔄 فاتورة مرتجع</h2>
                    </div>
                </div>

                {/* Invoice Details */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div>
                        <span className="text-muted-foreground">رقم المرتجع:</span>
                        <span className="font-bold text-foreground mr-2">{returnData.returnNumber || returnData.id.slice(0, 8)}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">التاريخ:</span>
                        <span className="mr-2">{formatDate(returnData.createdAt)}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">الفرع:</span>
                        <span className="font-medium mr-2">{returnData.branch.name}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">رقم الفاتورة الأصلية:</span>
                        <span className="mr-2 text-xs font-mono">{returnData.sale.id.slice(0, 8)}</span>
                    </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-sm mb-4">
                    <thead>
                        <tr className="border-y-2 border-border">
                            <th className="text-right py-2 font-bold text-foreground">#</th>
                            <th className="text-right py-2 font-bold text-foreground">الدواء</th>
                            <th className="text-right py-2 font-bold text-foreground">الكمية</th>
                            <th className="text-right py-2 font-bold text-foreground">السعر</th>
                            <th className="text-right py-2 font-bold text-foreground">المبلغ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {returnData.items.map((item, i) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="py-2 text-muted-foreground">{i + 1}</td>
                                <td className="py-2 font-medium">{item.drug.tradeName}</td>
                                <td className="py-2">{item.quantity}</td>
                                <td className="py-2">{fmt(item.price)} د.ع</td>
                                <td className="py-2 font-bold">{fmt(item.quantity * item.price)} د.ع</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Total */}
                <div className="border-t-2 border-border pt-3">
                    <div className="flex justify-between items-center text-lg">
                        <span className="font-bold text-foreground">المبلغ المسترد:</span>
                        <span className="font-bold text-destructive text-xl">{fmt(returnData.total)} د.ع</span>
                    </div>
                </div>

                {/* Notes */}
                {returnData.notes && (
                    <div className="mt-3 p-2 bg-muted rounded-lg text-sm text-muted-foreground">
                        <span className="font-medium">ملاحظات:</span> {returnData.notes}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 pt-3 border-t border-dashed text-center text-xs text-muted-foreground">
                    <p>نشكرك على تعاملك معنا</p>
                    <p className="mt-1">Powered by Faramace</p>
                </div>
            </div>
        </div>
    );
}
