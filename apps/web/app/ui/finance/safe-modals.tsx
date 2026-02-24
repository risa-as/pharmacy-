'use client';

import { useState } from 'react';
import { createSafe, createTransaction, transferFunds } from '@/app/lib/actions/finance-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function AddSafeModal({ branchId }: { branchId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState('CASH_DRAWER');
    const [balance, setBalance] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const res = await createSafe(branchId, {
            name,
            type,
            initialBalance: balance ? parseFloat(balance) : 0
        });

        if (res.success) {
            setIsOpen(false);
            setName('');
            setBalance('');
            router.refresh();
        } else {
            setError(res.error || 'Failed to create safe');
        }
        setLoading(false);
    };

    return (
        <>
            <Button onClick={() => setIsOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                صندوق جديد
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
                    <div className="bg-card p-6 rounded-xl w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setIsOpen(false)} className="absolute top-4 left-4 text-muted-foreground hover:text-destructive">
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold mb-4 font-cairo text-foreground">إضافة صندوق جديد</h2>

                        {error && <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mb-4">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">اسم الصندوق</label>
                                <Input required value={name} onChange={e => setName(e.target.value)} placeholder="مثال: درج الكاشير الرئيسي" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">تصنيف الصندوق</label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CASH_DRAWER">درج نقدي (الكاشير)</SelectItem>
                                        <SelectItem value="VAULT">خزنة رئيسية (قاصة)</SelectItem>
                                        <SelectItem value="BANK">حساب بنكي</SelectItem>
                                        <SelectItem value="MOBILE_WALLET">محفظة إلكترونية (زين كاش)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">الرصيد الافتتاحي (اختياري)</label>
                                <Input type="number" step="250" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0" />
                            </div>

                            <div className="flex gap-2 mt-6">
                                <Button type="submit" className="flex-1" disabled={loading}>
                                    {loading ? 'جاري الحفظ...' : 'حفظ'}
                                </Button>
                                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>
                                    إلغاء
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

export function TransferModal({ safes }: { safes: any[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [fromSafeId, setFromSafeId] = useState('');
    const [toSafeId, setToSafeId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (fromSafeId === toSafeId) {
            setError('لا يمكن التحويل لنفس الصندوق');
            return;
        }

        setLoading(true);
        setError('');

        const res = await transferFunds({
            fromSafeId,
            toSafeId,
            amount: parseFloat(amount),
            description
        });

        if (res.success) {
            setIsOpen(false);
            setAmount('');
            setDescription('');
            setFromSafeId('');
            setToSafeId('');
            router.refresh();
        } else {
            setError(res.error || 'Failed to transfer');
        }
        setLoading(false);
    };

    return (
        <>
            <Button onClick={() => setIsOpen(true)} className="gap-2 bg-info hover:bg-info/90">
                <ArrowRightLeft className="w-4 h-4" />
                تحويل داخلي
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
                    <div className="bg-card p-6 rounded-xl w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setIsOpen(false)} className="absolute top-4 left-4 text-muted-foreground hover:text-destructive">
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold mb-4 font-cairo text-foreground">تحويل بين الصناديق</h2>

                        {error && <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mb-4">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">من (سحب)</label>
                                    <Select required value={fromSafeId} onValueChange={setFromSafeId}>
                                        <SelectTrigger><SelectValue placeholder="اختر صندوق" /></SelectTrigger>
                                        <SelectContent>
                                            {safes.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.balance.toLocaleString()})</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">إلى (إيداع)</label>
                                    <Select required value={toSafeId} onValueChange={setToSafeId}>
                                        <SelectTrigger><SelectValue placeholder="اختر صندوق" /></SelectTrigger>
                                        <SelectContent>
                                            {safes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">المبلغ</label>
                                <Input required type="number" step="250" min="250" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">البيان / ملاحظة (اختياري)</label>
                                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="مثال: ترحيل إيراد اليوم" />
                            </div>

                            <div className="flex gap-2 mt-6">
                                <Button type="submit" className="flex-1 bg-info hover:bg-info/90" disabled={loading}>
                                    {loading ? 'جاري التحويل...' : 'تأكيد التحويل'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

export function VoucherModal({ safes, type }: { safes: any[], type: 'IN' | 'OUT' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [safeId, setSafeId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const isReciept = type === 'IN';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const res = await createTransaction({
            safeId,
            type,
            amount: parseFloat(amount),
            referenceType: 'VOUCHER',
            description
        });

        if (res.success) {
            setIsOpen(false);
            setAmount('');
            setDescription('');
            setSafeId('');
            router.refresh();
        } else {
            setError(res.error || 'Failed to process voucher');
        }
        setLoading(false);
    };

    return (
        <>
            <Button onClick={() => setIsOpen(true)} className={`gap-2 ${isReciept ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}`}>
                {isReciept ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                {isReciept ? 'سند قبض' : 'سند صرف'}
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
                    <div className="bg-card p-6 rounded-xl w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => setIsOpen(false)} className="absolute top-4 left-4 text-muted-foreground hover:text-destructive">
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold mb-4 font-cairo text-foreground">
                            {isReciept ? 'سند قبض (إيداع نقدي)' : 'سند صرف (سحب نقدي)'}
                        </h2>

                        {error && <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mb-4">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">حساب الصندوق</label>
                                <Select required value={safeId} onValueChange={setSafeId}>
                                    <SelectTrigger><SelectValue placeholder="اختر صندوق" /></SelectTrigger>
                                    <SelectContent>
                                        {safes.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.balance.toLocaleString()})</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">المبلغ</label>
                                <Input required type="number" step="250" min="250" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">البيان / ملاحظة</label>
                                <Input required value={description} onChange={e => setDescription(e.target.value)} placeholder={isReciept ? "مثال: دفعة من العميل س" : "مثال: نثريات ضيافة"} />
                            </div>

                            <div className="flex gap-2 mt-6">
                                <Button type="submit" className={`flex-1 ${isReciept ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}`} disabled={loading}>
                                    {loading ? 'جاري الحفظ...' : 'تأكيد السند'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
