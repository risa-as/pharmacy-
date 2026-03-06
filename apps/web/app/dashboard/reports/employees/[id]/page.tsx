import { PrismaClient } from "@prisma/client";
import { User, DollarSign, Calendar, TrendingUp, ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

// Keep this component clean, chart will be client-side if needed, 
// or simpler: just use server generated data for chart
// For Recharts we need client component. 
// Let's create a Client Component for the Chart.
import EmployeeSalesChart from "./chart";
import RecentSalesTable from "@/app/ui/dashboard/reports/recent-sales-table";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const employee = await prisma.user.findFirst({
        where: { id: params.id, ...tenantBranchWhere },
        include: {
            branch: true,
            _count: {
                select: { sales: true }
            }
        }
    });

    if (!employee) return notFound();

    // Fetch Last 30 Days Sales
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sales = await prisma.sale.findMany({
        where: {
            ...tenantBranchWhere,
            userId: params.id,
            createdAt: { gte: thirtyDaysAgo }
        },
        orderBy: { createdAt: 'desc' },
        include: {
            items: {
                include: {
                    drug: true
                }
            },
            user: true
        }
    });

    // Stats
    const totalSales = sales.reduce((acc, sale) => acc + sale.total, 0);
    const saleCount = sales.length;
    const averageSale = saleCount > 0 ? totalSales / saleCount : 0;

    // Prepare Chart Data
    // Group by Date
    const dailyData = sales.reduce((acc: any, sale) => {
        const date = format(sale.createdAt, 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + sale.total;
        return acc;
    }, {});

    const chartData = Object.keys(dailyData).map(date => ({
        date,
        total: dailyData[date]
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Recent Activity (Top 20)
    const recentActivity = sales.slice(0, 20);

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-2xl">
                    {employee.name?.charAt(0) || 'U'}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{employee.name}</h1>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {employee.role}
                        </span>
                        <span className="flex items-center gap-1">
                            <ShoppingBag className="w-4 h-4" />
                            {employee.branch?.name || 'غير محدد'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-muted-foreground text-sm mb-1">إجمالي المبيعات (30 يوم)</p>
                        <h3 className="text-3xl font-bold text-foreground">{totalSales.toLocaleString()}</h3>
                    </div>
                    <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success">
                        <DollarSign className="w-6 h-6" />
                    </div>
                </div>
                <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-muted-foreground text-sm mb-1">عدد المعاملات</p>
                        <h3 className="text-3xl font-bold text-foreground">{saleCount}</h3>
                    </div>
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                        <ShoppingBag className="w-6 h-6" />
                    </div>
                </div>
                <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-muted-foreground text-sm mb-1">متوسط قيمة السلة</p>
                        <h3 className="text-3xl font-bold text-foreground">{averageSale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                    </div>
                    <div className="w-12 h-12 bg-info rounded-full flex items-center justify-center text-info">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Chart Section */}
            <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-muted-foreground" />
                    أداء المبيعات اليومي
                </h3>
                <div className="h-[300px] w-full">
                    <EmployeeSalesChart data={chartData} />
                </div>
            </div>

            {/* Recent Activity Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-muted-foreground" />
                        آخر العمليات
                    </h3>
                </div>
                <RecentSalesTable sales={recentActivity} />
            </div>
        </div>
    );
}

