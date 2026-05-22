'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Clock, Banknote, TrendingUp } from 'lucide-react';

export default function EmployeeReportsPage() {
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('monthly');

    useEffect(() => {
        fetchStats();
    }, [period]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/employees?period=${period}`);
            const data = await res.json();
            setStats(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">جاري تحميل بيانات الموظفين...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users className="w-8 h-8 text-blue-600" />
                    تقارير أداء الموظفين
                </h1>
                <div className="flex bg-card rounded-lg shadow-sm border p-1">
                    <button
                        onClick={() => setPeriod('daily')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${period === 'daily' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        يومي
                    </button>
                    <button
                        onClick={() => setPeriod('weekly')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${period === 'weekly' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        أسبوعي
                    </button>
                    <button
                        onClick={() => setPeriod('monthly')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${period === 'monthly' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                        شهري
                    </button>
                </div>
            </div>

            {/* Top Performers Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-50 to-white border rounded-xl shadow-sm p-4">
                    <div className="pb-2">
                        <h3 className="text-sm font-medium text-emerald-800">الأكثر مبيعاً</h3>
                    </div>
                    <div>
                        {stats.length > 0 && stats.sort((a: any, b: any) => b.totalSales - a.totalSales)[0] ? (
                            <div>
                                <div className="text-2xl font-bold text-emerald-600">
                                    {stats.sort((a: any, b: any) => b.totalSales - a.totalSales)[0].name}
                                </div>
                                <p className="text-sm text-emerald-600 mt-1">
                                    {new Intl.NumberFormat('en-US').format(stats.sort((a: any, b: any) => b.totalSales - a.totalSales)[0].totalSales)} د.ع
                                </p>
                            </div>
                        ) : <p>-</p>}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-white border rounded-xl shadow-sm p-4">
                    <div className="pb-2">
                        <h3 className="text-sm font-medium text-blue-800">الأكثر نشاطاً (معاملات)</h3>
                    </div>
                    <div>
                        {stats.length > 0 && stats.sort((a: any, b: any) => b.transactionCount - a.transactionCount)[0] ? (
                            <div>
                                <div className="text-2xl font-bold text-blue-600">
                                    {stats.sort((a: any, b: any) => b.transactionCount - a.transactionCount)[0].name}
                                </div>
                                <p className="text-sm text-blue-600 mt-1">
                                    {stats.sort((a: any, b: any) => b.transactionCount - a.transactionCount)[0].transactionCount} فاتورة
                                </p>
                            </div>
                        ) : <p>-</p>}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-white border rounded-xl shadow-sm p-4">
                    <div className="pb-2">
                        <h3 className="text-sm font-medium text-purple-800">أداء الساعات</h3>
                    </div>
                    <div>
                        {stats.length > 0 && stats.sort((a: any, b: any) => b.salesPerHour - a.salesPerHour)[0] ? (
                            <div>
                                <div className="text-2xl font-bold text-purple-600">
                                    {stats.sort((a: any, b: any) => b.salesPerHour - a.salesPerHour)[0].name}
                                </div>
                                <p className="text-sm text-purple-600 mt-1">
                                    {new Intl.NumberFormat('en-US').format(stats.sort((a: any, b: any) => b.salesPerHour - a.salesPerHour)[0].salesPerHour)} د.ع / ساعة
                                </p>
                            </div>
                        ) : <p>-</p>}
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="border rounded-xl shadow-sm bg-card p-4">
                <div className="pb-4">
                    <h3 className="font-bold text-lg">مقارنة المبيعات بين الموظفين</h3>
                </div>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) + ' د.ع' : value} />
                            <Legend />
                            <Bar dataKey="totalSales" name="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="border rounded-xl shadow-sm bg-card p-4">
                <div className="pb-4">
                    <h3 className="font-bold text-lg">تفاصيل الأداء</h3>
                </div>
                <div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-muted text-foreground">
                                <tr>
                                    <th className="p-3">الموظف</th>
                                    <th className="p-3">الدور</th>
                                    <th className="p-3">إجمالي المبيعات</th>
                                    <th className="p-3">عدد الفواتير</th>
                                    <th className="p-3">متوسط السلة</th>
                                    <th className="p-3">إجمالي الساعات</th>
                                    <th className="p-3">المبيعات/ساعة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {stats.map((user: any) => (
                                    <tr key={user.id} className="hover:bg-muted">
                                        <td className="p-3 font-medium">{user.name}</td>
                                        <td className="p-3 text-muted-foreground text-xs">{user.role}</td>
                                        <td className="p-3 font-bold text-green-600">{new Intl.NumberFormat('en-US').format(user.totalSales)} د.ع</td>
                                        <td className="p-3">{user.transactionCount}</td>
                                        <td className="p-3">{new Intl.NumberFormat('en-US').format(user.averageBasket)} د.ع</td>
                                        <td className="p-3 flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-muted-foreground" />
                                            {user.totalHours.toFixed(1)} س
                                        </td>
                                        <td className="p-3 font-semibold text-blue-600">{new Intl.NumberFormat('en-US').format(user.salesPerHour)} د.ع</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
