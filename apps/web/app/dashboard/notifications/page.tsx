'use client';

import { useState, useEffect } from 'react';
import { Send, Bell, Users, Store } from 'lucide-react';

export default function NotificationsPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [targetType, setTargetType] = useState<'all' | 'branch'>('all');
    const [branchId, setBranchId] = useState('');
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState('');

    useEffect(() => {
        // Fetch stats
        fetch('/api/notifications/push')
            .then(r => r.json())
            .then(d => setStats(d));

        // Fetch branches
        fetch('/api/branches')
            .then(r => r.json())
            .then(d => setBranches(d || []));
    }, []);

    const sendNotification = async () => {
        if (!title || !body) return;
        setSending(true);
        setResult('');
        try {
            const payload: any = { title, body, targetAll: targetType === 'all' };
            if (targetType === 'branch' && branchId) {
                payload.targetBranchId = branchId;
                payload.targetAll = false;
            }

            const res = await fetch('/api/notifications/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setResult(`✅ تم الإرسال بنجاح إلى ${data.sent} مستخدم`);
                setTitle('');
                setBody('');
            } else {
                setResult(`❌ ${data.message || 'فشل الإرسال'}`);
            }
        } catch (e) {
            setResult('❌ خطأ في الاتصال');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">🔔 إرسال تنبيهات Push</h1>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-primary/10 border border-primary rounded-xl p-4">
                        <div className="flex items-center gap-2 text-primary text-sm mb-1">
                            <Users className="w-4 h-4" /> إجمالي المستخدمين
                        </div>
                        <div className="text-2xl font-bold text-primary">{stats.totalUsers}</div>
                    </div>
                    <div className="bg-success/10 border border-green-100 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-success text-sm mb-1">
                            <Bell className="w-4 h-4" /> التنبيهات مفعّلة
                        </div>
                        <div className="text-2xl font-bold text-success">{stats.totalEnabled}</div>
                    </div>
                    <div className="bg-muted border border-border rounded-xl p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                            <Store className="w-4 h-4" /> فروع مع Push
                        </div>
                        <div className="text-2xl font-bold text-foreground">{stats.byBranch?.length || 0}</div>
                    </div>
                </div>
            )}

            {/* Send Form */}
            <div className="bg-card rounded-xl shadow-sm border p-6 max-w-xl">
                <h2 className="font-semibold text-foreground mb-4">إرسال تنبيه جديد</h2>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">العنوان</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                            placeholder="عنوان التنبيه..."
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">المحتوى</label>
                        <textarea value={body} onChange={(e) => setBody(e.target.value)}
                            rows={3} placeholder="محتوى التنبيه..."
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">إرسال إلى</label>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-1 text-sm">
                                <input type="radio" name="target" checked={targetType === 'all'}
                                    onChange={() => setTargetType('all')} />
                                الكل
                            </label>
                            <label className="flex items-center gap-1 text-sm">
                                <input type="radio" name="target" checked={targetType === 'branch'}
                                    onChange={() => setTargetType('branch')} />
                                فرع محدد
                            </label>
                        </div>
                        {targetType === 'branch' && (
                            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                                className="mt-2 border rounded-lg px-3 py-2 text-sm bg-muted w-full">
                                <option value="">اختر فرع</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                    </div>

                    <button onClick={sendNotification} disabled={sending || !title || !body}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                        <Send className="w-4 h-4" /> {sending ? 'جاري الإرسال...' : 'إرسال'}
                    </button>

                    {result && (
                        <div className="p-3 rounded-lg bg-muted text-sm text-center">{result}</div>
                    )}
                </div>
            </div>
        </div>
    );
}
