import { getExpenses, deleteExpense } from '@/app/lib/actions/expense-actions';
import { DeleteButton } from '@/app/ui/delete-button';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default async function ExpensesPage() {
    const expenses = await getExpenses();

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">المصروفات</h1>
                <Link href="/dashboard/expenses/create">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" />
                        مصروف جديد
                    </Button>
                </Link>
            </div>

            <div className="bg-card rounded-lg shadow border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">الفئة</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">الوصف</TableHead>
                            <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {expenses.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    لا يوجد مصروفات مسجلة
                                </TableCell>
                            </TableRow>
                        ) : (
                            expenses.map((expense: any) => (
                                <TableRow key={expense.id}>
                                    <TableCell>{format(new Date(expense.date), 'PPP', { locale: ar })}</TableCell>
                                    <TableCell className="font-medium">{expense.category}</TableCell>
                                    <TableCell className="font-bold text-destructive">-{expense.amount.toLocaleString()} د.ع</TableCell>
                                    <TableCell>{expense.description || '-'}</TableCell>
                                    <TableCell>
                                        <DeleteButton
                                            action={deleteExpense.bind(null, expense.id)}
                                            description="المصروف"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        />
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
