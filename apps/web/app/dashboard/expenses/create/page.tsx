'use client';

import { createExpense } from '@/app/lib/actions/expense-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const CATEGORIES = [
    'إيجار',
    'رواتب',
    'كهرباء/ماء',
    'صيانة',
    'نثرية',
    'تسويق',
    'أخرى'
];

export default function CreateExpensePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState('');

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const amount = Number(formData.get('amount'));
        const description = formData.get('description') as string;
        const dateStr = formData.get('date') as string;

        if (!amount || !category) {
            toast.error('يرجى تعبئة الحقول المطلوبة');
            return;
        }

        setLoading(true);
        try {
            const res = await createExpense({
                amount,
                category,
                description,
                date: dateStr ? new Date(dateStr) : new Date()
            });

            if (res.success) {
                toast.success('تم تسجيل المصروف بنجاح');
                router.push('/dashboard/expenses');
                router.refresh();
            } else {
                toast.error((res as any).error || 'فشل في التسجيل');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold">تسجيل مصروف جديد</h1>

            <form onSubmit={handleSubmit} className="bg-card p-6 rounded-lg shadow space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">المبلغ (د.ع)</label>
                    <Input name="amount" type="number" placeholder="0" required />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">الفئة</label>
                    <Select onValueChange={setCategory} required>
                        <SelectTrigger>
                            <SelectValue placeholder="اختر الفئة" />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORIES.map((c: any) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">التاريخ</label>
                    <Input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">ملاحظات / وصف</label>
                    <Input name="description" placeholder="تفاصيل إضافية..." />
                </div>

                <div className="pt-4 flex gap-4">
                    <Button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2">
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>جاري الحفظ...</span>
                            </>
                        ) : 'حفظ المصروف'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()} className="w-full">
                        إلغاء
                    </Button>
                </div>
            </form>
        </div>
    );
}
