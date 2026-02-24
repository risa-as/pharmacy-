import { getPurchaseDetails } from '@/app/lib/actions/purchase-actions';
import { prisma } from '@/app/lib/prisma';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PurchasePrintButton from './components/print-button';

import PrintHeader from '@/app/ui/components/print-header';

export default async function PurchaseDetailsPage({ params }: { params: { id: string } }) {
    const purchase = await getPurchaseDetails(params.id);

    if (!purchase) {
        return <div>الطلب غير موجود</div>;
    }

    // Manual Fetch for Drug Names
    const drugIds = purchase.items.map(i => i.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: drugIds } }
    });
    const drugMap = new Map(drugs.map(d => [d.id, d]));

    const itemsWithNames = purchase.items.map(item => ({
        ...item,
        drugName: drugMap.get(item.drugId)?.tradeName || 'Unknown'
    }));

    // WhatsApp Message
    const header = `*طلب شراء جديد من صيدلية فاراماس*`;
    const body = itemsWithNames.map(i => `- ${i.drugName}: ${i.quantity} قطعة`).join('\n');
    const msg = encodeURIComponent(`${header}\n\n${body}`);

    // Format phone number: remove non-digits, replace leading 0 with 964
    let phone = (purchase.supplier.phone || '').replace(/\D/g, '');
    if (phone.startsWith('07')) {
        phone = '964' + phone.substring(1);
    }

    const waLink = `https://wa.me/${phone}?text=${msg}`;

    return (
        <div className="p-6 space-y-6" dir="rtl">
            <PrintHeader />
            <div className="flex justify-between items-center bg-card p-4 rounded-lg shadow print:shadow-none print:border-none">
                <div>
                    <h1 className="text-2xl font-bold">تفاصيل الطلب #{purchase.id.slice(0, 8)}</h1>
                    <p className="text-muted-foreground">من المورد: {purchase.supplier.name}</p>
                    <p className="text-muted-foreground">التاريخ: {format(new Date(purchase.createdAt), 'PPP', { locale: ar })}</p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                        <Button className="bg-success hover:bg-success/90">
                            إرسال عبر واتساب
                        </Button>
                    </a>
                    <PurchasePrintButton />
                    {purchase.status === 'PENDING' && (
                        <Link href={`/dashboard/purchases/${params.id}/receive`}>
                            <Button>استلام المواد</Button>
                        </Link>
                    )}
                </div>
            </div>

            <div className="bg-card rounded-lg shadow overflow-hidden print:shadow-none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">المادة</TableHead>
                            <TableHead className="text-right">الكمية</TableHead>
                            <TableHead className="text-right">التكلفة (تقديري)</TableHead>
                            <TableHead className="text-right">الإجمالي</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {itemsWithNames.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.drugName}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.cost.toLocaleString()}</TableCell>
                                <TableCell>{(item.quantity * item.cost).toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
