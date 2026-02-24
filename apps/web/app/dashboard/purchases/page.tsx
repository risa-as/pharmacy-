import { getPurchases } from '@/app/lib/actions/purchase-actions';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/app/lib/utils';
import Link from 'next/link';
import { Truck } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { auth } from "@/auth";

export default async function PurchasesPage() {
    const session = await auth();
    const branchId = session?.user?.branchId;
    const isAdmin = session?.user?.role === "ADMIN";

    if (!branchId && !isAdmin) {
        return <div className="p-8 text-center text-destructive">يرجى تسجيل الدخول لعرض المشتريات.</div>;
    }

    // If Admin, fetch all. If not, fetch for specific branch.
    // Note: If Admin wants to see ONLY their branch, we might need a filter later.
    // For now, showing ALL ensures they see the orders they just created for other branches.
    const purchases = await getPurchases(isAdmin ? undefined : (branchId || undefined));

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">سجل المشتريات</h1>
                <Link href="/dashboard/purchases/smart-order">
                    <Button className="gap-2">
                        <Truck className="w-4 h-4" />
                        طلب ذكي جديد
                    </Button>
                </Link>
            </div>

            <div className="bg-card rounded-lg shadow border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">رقم الطلب</TableHead>
                            <TableHead className="text-right">الفرع</TableHead>
                            <TableHead className="text-right">المورد</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">عدد المواد</TableHead>
                            <TableHead className="text-right">الإجمالي</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                            <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {purchases.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    لا يوجد سجل مشتريات
                                </TableCell>
                            </TableRow>
                        ) : (
                            purchases.map((purchase) => (
                                <TableRow key={purchase.id}>
                                    <TableCell className="font-mono text-xs">{purchase.id.slice(0, 8)}</TableCell>
                                    <TableCell className="text-sm">{purchase.branch?.name || 'غير معروف'}</TableCell>
                                    <TableCell className="font-medium">{purchase.supplier.name}</TableCell>
                                    <TableCell>{format(new Date(purchase.createdAt), 'PPP', { locale: ar })}</TableCell>
                                    <TableCell>{purchase._count.items}</TableCell>
                                    <TableCell>{purchase.total.toLocaleString()} د.ع</TableCell>
                                    <TableCell>
                                        <span className={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            {
                                                "bg-warning/20 text-warning": purchase.status === 'PENDING',
                                                "bg-success/10 text-success": purchase.status === 'COMPLETED',
                                                "bg-destructive/10 text-destructive": purchase.status === 'CANCELLED',
                                            }
                                        )}>
                                            {purchase.status === 'PENDING' ? 'قيد الانتظار' :
                                                purchase.status === 'COMPLETED' ? 'مكتمل' :
                                                    purchase.status}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/dashboard/purchases/${purchase.id}`}>
                                            <Button variant="ghost" size="sm">عرض</Button>
                                        </Link>
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
