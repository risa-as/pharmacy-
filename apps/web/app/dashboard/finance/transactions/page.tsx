import { getBranchTransactions } from '@/app/lib/actions/finance-actions';
import { FileText, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function TransactionsPage() {
    const branchId = 'branch-1';
    const transactions = await getBranchTransactions(branchId);

    const getIcon = (type: string, ref: string) => {
        if (ref === 'TRANSFER') return <ArrowRightLeft className="w-5 h-5 text-indigo-500" />;
        return type === 'IN'
            ? <ArrowDownToLine className="w-5 h-5 text-emerald-500" />
            : <ArrowUpFromLine className="w-5 h-5 text-rose-500" />;
    };

    const getTypeColor = (type: string) => {
        return type === 'IN' ? 'text-success bg-success/10' : 'text-rose-600 bg-rose-50';
    };

    const getRefLabel = (ref: string) => {
        switch (ref) {
            case 'SALE': return 'مبيعات نقدية';
            case 'EXPENSE': return 'مصروفات';
            case 'SUPPLIER_PAYMENT': return 'دفعة مورد';
            case 'CUSTOMER_RECEIPT': return 'قبض ديون عميل';
            case 'TRANSFER': return 'تحويل داخلي';
            case 'VOUCHER': return 'سند يدوي';
            default: return ref;
        }
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex justify-between items-center bg-card p-6 rounded-2xl shadow-sm border border-border">
                <div>
                    <h1 className="text-2xl font-bold font-cairo flex items-center gap-3 text-foreground">
                        <FileText className="w-8 h-8 text-indigo-600" />
                        دفتر حركة الأموال (القيود)
                    </h1>
                    <p className="text-muted-foreground mt-1">سجل بجميع العمليات المالية الصادرة والواردة لكل الصناديق</p>
                </div>
                <div className="text-left bg-muted p-4 rounded-xl border border-border">
                    <p className="text-sm text-muted-foreground font-bold mb-1">العمليات المسجلة</p>
                    <p className="text-3xl font-bold text-foreground">{transactions.length} <span className="text-lg">حركة</span></p>
                </div>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted">
                        <TableRow>
                            <TableHead className="text-right font-cairo text-foreground">التاريخ والوقت</TableHead>
                            <TableHead className="text-right font-cairo text-foreground">نوع الحركة</TableHead>
                            <TableHead className="text-right font-cairo text-foreground">المبلغ</TableHead>
                            <TableHead className="text-right font-cairo text-foreground">الصندوق</TableHead>
                            <TableHead className="text-right font-cairo text-foreground">التصنيف</TableHead>
                            <TableHead className="text-right font-cairo text-foreground">البيان (الوصف)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                    لا توجد حركات مالية مسجلة بعد
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((tx: any) => (
                                <TableRow key={tx.id} className="hover:bg-muted/50">
                                    <TableCell className="font-medium text-muted-foreground">
                                        <div className="flex flex-col">
                                            <span>{format(new Date(tx.createdAt), 'PPP', { locale: ar })}</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), 'hh:mm a')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 bg-muted rounded-lg">
                                                {getIcon(tx.type, tx.referenceType)}
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${getTypeColor(tx.type)}`}>
                                                {tx.type === 'IN' ? 'وارد (قبض)' : 'صادر (صرف)'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-bold text-lg" dir="ltr">
                                        <span className={tx.type === 'IN' ? 'text-success' : 'text-rose-600'}>
                                            {tx.type === 'IN' ? '+' : '-'}{tx.amount.toLocaleString()} <span className="text-xs">IQD</span>
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-indigo-700 font-medium">
                                        {/* @ts-ignore */}
                                        {tx.safe?.name || 'صندوق غير معروف'}
                                    </TableCell>
                                    <TableCell>
                                        <span className="bg-muted text-muted-foreground px-2 py-1 rounded-md text-xs font-bold">
                                            {getRefLabel(tx.referenceType)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                        {tx.description || '-'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
