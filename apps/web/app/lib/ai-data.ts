import { prisma } from '@/app/lib/prisma';
import type { TenantContext } from '@/app/lib/tenant-utils';

export type AIDataContext = Pick<TenantContext, 'tenantBranchWhere' | 'organizationId'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
    return n.toLocaleString('ar-IQ') + ' IQD';
}

function fmtDate(d: Date) {
    return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Sales Summary ───────────────────────────────────────────────────────────

export async function getSalesSummary(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const where = { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };

    const [agg, saleItems] = await Promise.all([
        prisma.sale.aggregate({
            _sum: { total: true, discount: true },
            _count: { id: true },
            where,
        }),
        prisma.saleItem.findMany({
            where: { sale: where },
            select: {
                quantity: true,
                drugId: true,
                drug: { select: { tradeName: true } },
            },
        }),
    ]);

    const drugTotals: Record<string, { name: string; qty: number }> = {};
    for (const item of saleItems) {
        if (!drugTotals[item.drugId]) {
            drugTotals[item.drugId] = { name: item.drug.tradeName, qty: 0 };
        }
        drugTotals[item.drugId].qty += item.quantity;
    }
    const topDrugs = Object.values(drugTotals)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    return `## ملخص المبيعات (${fmtDate(from)} — ${fmtDate(to)})
- إجمالي المبيعات: ${fmt(agg._sum.total ?? 0)}
- عدد الفواتير: ${agg._count.id}
- إجمالي التخفيضات: ${fmt(agg._sum.discount ?? 0)}
- أكثر الأدوية مبيعاً: ${topDrugs.length ? topDrugs.map(d => `${d.name} (${d.qty} وحدة)`).join('، ') : 'لا يوجد بيانات'}`;
}

// ─── Sales by Cashier ────────────────────────────────────────────────────────

export async function getSalesByCashier(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const where = { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };

    const grouped = await prisma.sale.groupBy({
        by: ['userId'],
        where,
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
    });

    const userIds = grouped.map(g => g.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.name ?? 'غير معروف']));

    if (!grouped.length) return '## أداء الكاشيرات\nلا توجد مبيعات في هذه الفترة.';

    const rows = grouped.map(g => {
        const name = g.userId ? (userMap.get(g.userId) ?? 'غير معروف') : 'غير محدد';
        return `- ${name}: ${fmt(g._sum.total ?? 0)} (${g._count.id} فاتورة)`;
    });

    return `## أداء الكاشيرات (${fmtDate(from)} — ${fmtDate(to)})\n${rows.join('\n')}`;
}

// ─── Suspicious Activity ─────────────────────────────────────────────────────

export async function getSuspiciousActivity(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const where = { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };

    const settings = await prisma.companySettings.findFirst({
        where: { organizationId: ctx.organizationId },
        select: { maxDiscountPercent: true },
    });
    const maxDiscount = settings?.maxDiscountPercent ?? 10;

    const [overrides, returns] = await Promise.all([
        prisma.sale.findMany({
            where: { ...where, OR: [{ hasPriceOverride: true }, { discount: { gt: maxDiscount } }] },
            select: {
                id: true,
                invoiceNumber: true,
                total: true,
                discount: true,
                hasPriceOverride: true,
                createdAt: true,
                user: { select: { name: true } },
                items: {
                    where: { originalPrice: { not: null } },
                    select: {
                        price: true,
                        originalPrice: true,
                        quantity: true,
                        drug: { select: { tradeName: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        }),
        prisma.saleReturn.groupBy({
            by: ['saleId'],
            where: { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } },
            _count: { id: true },
            having: { id: { _count: { gt: 1 } } },
        }),
    ]);

    const lines: string[] = [];

    if (overrides.length) {
        lines.push(`### تجاوزات الأسعار والخصومات (الحد المسموح: ${maxDiscount}%)`);
        for (const s of overrides) {
            const userName = s.user?.name ?? 'غير معروف';
            const flags: string[] = [];
            if (s.hasPriceOverride) flags.push('تعديل سعر');
            if (s.discount > maxDiscount) flags.push(`خصم ${s.discount}% > الحد ${maxDiscount}%`);
            const invNo = s.invoiceNumber != null ? `#${String(s.invoiceNumber).padStart(4, '0')}` : `#${s.id.slice(0, 8)}`;
            lines.push(`- فاتورة ${invNo} | ${userName} | إجمالي: ${fmt(s.total)} | ${flags.join(' + ')} | ${fmtDate(s.createdAt)}`);
            for (const item of s.items) {
                const orig = item.originalPrice!;
                const actual = item.price;
                const saved = orig - actual;
                const pct = orig > 0 ? ((saved / orig) * 100).toFixed(0) : '0';
                lines.push(`  ↳ ${item.drug.tradeName}: السعر الأصلي ${fmt(orig)} → السعر الفعلي ${fmt(actual)} (خفض ${pct}%) × ${item.quantity} وحدة | فارق: ${fmt(saved)}`);
            }
        }
    } else {
        lines.push('### تجاوزات الأسعار والخصومات\nلا توجد تجاوزات في هذه الفترة.');
    }

    if (returns.length) {
        lines.push(`\n### مرتجعات متكررة\n- وُجد ${returns.length} فاتورة لها أكثر من مرتجع واحد.`);
    }

    return `## الحركات المشبوهة (${fmtDate(from)} — ${fmtDate(to)})\n${lines.join('\n')}`;
}

// ─── Profit Summary ──────────────────────────────────────────────────────────

export async function getProfitSummary(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const saleShere = { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };
    const expWhere  = { ...ctx.tenantBranchWhere, date:      { gte: from, lte: to } };

    const [salesAgg, saleItems, expensesAgg, returnsAgg] = await Promise.all([
        prisma.sale.aggregate({
            _sum: { total: true, discount: true },
            _count: { id: true },
            where: saleShere,
        }),
        prisma.saleItem.findMany({
            where: { sale: saleShere },
            select: { cost: true, quantity: true },
        }),
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: expWhere,
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true },
            where: { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } },
        }),
    ]);

    const revenue  = salesAgg._sum.total ?? 0;
    const cogs     = saleItems.reduce((s, i) => s + i.cost * i.quantity, 0);
    const expenses = expensesAgg._sum.amount ?? 0;
    const returns  = returnsAgg._sum.total ?? 0;
    const gross    = revenue - cogs;
    const net      = gross - expenses - returns;
    const margin   = revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0';

    return `## تقرير الأرباح (${fmtDate(from)} — ${fmtDate(to)})
- إجمالي المبيعات:   ${fmt(revenue)}
- تكلفة البضائع:     ${fmt(cogs)}
- إجمالي المرتجعات:  ${fmt(returns)}
- المصاريف:          ${fmt(expenses)}
- الربح الإجمالي:    ${fmt(gross)}
- صافي الربح:        ${fmt(net)}
- هامش الربح:        ${margin}%`;
}

// ─── Expenses Summary ────────────────────────────────────────────────────────

export async function getExpensesSummary(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const grouped = await prisma.expense.groupBy({
        by: ['category'],
        where: { ...ctx.tenantBranchWhere, date: { gte: from, lte: to } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
    });

    if (!grouped.length) return '## المصاريف\nلا توجد مصاريف مسجّلة في هذه الفترة.';

    const total = grouped.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
    const rows  = grouped.map(g => `- ${g.category}: ${fmt(g._sum.amount ?? 0)}`);
    return `## المصاريف (${fmtDate(from)} — ${fmtDate(to)})\n${rows.join('\n')}\n- **الإجمالي: ${fmt(total)}**`;
}

// ─── Debt Summary ────────────────────────────────────────────────────────────

export async function getDebtSummary(ctx: AIDataContext): Promise<string> {
    const debtors = await prisma.patient.findMany({
        where: { balance: { gt: 0 }, ...ctx.tenantBranchWhere },
        select: { name: true, phone: true, balance: true },
        orderBy: { balance: 'desc' },
        take: 10,
    });

    if (!debtors.length) return '## الديون\nلا توجد ديون مستحقة حالياً.';

    const total = debtors.reduce((s, p) => s + p.balance, 0);
    const rows  = debtors.map(p => `- ${p.name} (${p.phone}): ${fmt(p.balance)}`);
    return `## أكبر المدينين (أعلى 10)\n${rows.join('\n')}\n- **إجمالي الديون المعروضة: ${fmt(total)}**`;
}

// ─── Low Stock ───────────────────────────────────────────────────────────────

export async function getLowStockItems(ctx: AIDataContext): Promise<string> {
    const inventories = await prisma.inventory.findMany({
        where: ctx.tenantBranchWhere,
        select: {
            minStock: true,
            drugId: true,
            drug: { select: { tradeName: true } },
            branch: { select: { name: true } },
            batches: { select: { quantity: true } },
        },
    });

    // Prisma لا يدعم column-to-column comparison في where — نُصفّي في JS
    const lowStock = inventories
        .map(inv => ({
            name: inv.drug.tradeName,
            branch: inv.branch.name,
            current: inv.batches.reduce((s, b) => s + b.quantity, 0),
            min: inv.minStock,
        }))
        .filter(inv => inv.current < inv.min)
        .sort((a, b) => (a.current / a.min) - (b.current / b.min));

    if (!lowStock.length) return '## المخزن\nجميع الأصناف فوق الحد الأدنى — لا توجد نواقص.';

    const rows = lowStock.map(i => `- ${i.name} (${i.branch}): متوفر ${i.current} / الحد ${i.min}`);
    return `## الأدوية الناقصة (${lowStock.length} صنف)\n${rows.join('\n')}`;
}

// ─── Expiring Batches ────────────────────────────────────────────────────────

export async function getExpiringBatches(days = 30, ctx: AIDataContext): Promise<string> {
    const now   = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + days);

    const batches = await prisma.batch.findMany({
        where: {
            expiryDate: { gt: now, lte: limit },   // لم تنتهِ بعد لكن ستنتهي قريباً
            quantity: { gt: 0 },
            inventory: ctx.tenantBranchWhere,
        },
        select: {
            expiryDate: true,
            quantity: true,
            inventory: {
                select: {
                    drug: { select: { tradeName: true } },
                    branch: { select: { name: true } },
                },
            },
        },
        orderBy: { expiryDate: 'asc' },
    });

    if (!batches.length) return `## الصلاحيات\nلا توجد أدوية تنتهي صلاحيتها خلال ${days} يوماً القادمة.`;

    const rows = batches.map(b => {
        const daysLeft = Math.ceil((b.expiryDate.getTime() - now.getTime()) / 86_400_000);
        const status   = daysLeft <= 7 ? '🔴 عاجل' : daysLeft <= 14 ? '🟠 قريب' : '🟡 تنبيه';
        return `- ${b.inventory.drug.tradeName} (${b.inventory.branch.name}): ${b.quantity} وحدة | ينتهي ${fmtDate(b.expiryDate)} (${daysLeft} يوم) ${status}`;
    });
    return `## الأدوية قريبة انتهاء الصلاحية خلال ${days} يوم (${batches.length} دفعة)\n${rows.join('\n')}`;
}

// ─── Shift Summary ───────────────────────────────────────────────────────────

export async function getShiftSummary(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const shifts = await prisma.shift.findMany({
        where: { ...ctx.tenantBranchWhere, startTime: { gte: from, lte: to } },
        select: {
            startTime: true,
            endTime: true,
            status: true,
            startingCash: true,
            expectedCash: true,
            actualCash: true,
            user: { select: { name: true } },
            branch: { select: { name: true } },
        },
        orderBy: { startTime: 'desc' },
        take: 20,
    });

    if (!shifts.length) return '## الورديات\nلا توجد ورديات في هذه الفترة.';

    const rows = shifts.map(s => {
        const diff   = s.actualCash != null ? s.actualCash - s.expectedCash : null;
        const diffTx = diff != null ? ` | فرق الكاش: ${diff >= 0 ? '+' : ''}${fmt(diff)}` : '';
        const status = s.status === 'OPEN' ? '🟢 مفتوحة' : '🔴 مغلقة';
        return `- ${s.user?.name ?? '—'} (${s.branch?.name ?? '—'}) | ${fmtDate(s.startTime)} | ${status}${diffTx}`;
    });
    return `## الورديات (${fmtDate(from)} — ${fmtDate(to)})\n${rows.join('\n')}`;
}

// ─── User List ───────────────────────────────────────────────────────────────

export async function getUserList(ctx: AIDataContext): Promise<string> {
    const users = await prisma.user.findMany({
        where: { branch: { organizationId: ctx.organizationId } },
        select: { name: true, role: true },
        orderBy: { name: 'asc' },
    });

    if (!users.length) return '## المستخدمون\nلا يوجد مستخدمون مسجّلون.';

    const roleLabel: Record<string, string> = { ADMIN: 'مدير', PHARMACIST: 'صيدلاني', CASHIER: 'كاشير' };
    const rows = users.map(u => `- ${u.name ?? '—'} (${roleLabel[u.role] ?? u.role})`);
    return `## المستخدمون في النظام\n${rows.join('\n')}`;
}

// ─── Expired Drugs ────────────────────────────────────────────────────────────

export async function getExpiredDrugs(ctx: AIDataContext): Promise<string> {
    const now = new Date();

    const batches = await prisma.batch.findMany({
        where: {
            expiryDate: { lt: now },
            quantity: { gt: 0 },
            inventory: ctx.tenantBranchWhere,
        },
        select: {
            expiryDate: true,
            quantity: true,
            inventory: {
                select: {
                    price: true,
                    drug: { select: { tradeName: true } },
                    branch: { select: { name: true } },
                },
            },
        },
        orderBy: { expiryDate: 'asc' },
    });

    if (!batches.length) return '## الأدوية منتهية الصلاحية\n✅ لا توجد أدوية منتهية الصلاحية في المخزن.';

    const totalUnits = batches.reduce((s, b) => s + b.quantity, 0);
    const totalValue = batches.reduce((s, b) => s + b.quantity * b.inventory.price, 0);

    const rows = batches.map(b => {
        const daysAgo = Math.ceil((now.getTime() - b.expiryDate.getTime()) / 86_400_000);
        return `- ${b.inventory.drug.tradeName} (${b.inventory.branch.name}): ${b.quantity} وحدة | انتهت منذ ${daysAgo} يوم (${fmtDate(b.expiryDate)})`;
    });

    return `## ⛔ الأدوية منتهية الصلاحية (${batches.length} دفعة — ${totalUnits} وحدة)
قيمة البضاعة المنتهية: ${fmt(totalValue)}
${rows.join('\n')}`;
}

// ─── Pending Orders ───────────────────────────────────────────────────────────

export async function getPendingOrders(ctx: AIDataContext): Promise<string> {
    const pending = await prisma.purchase.findMany({
        where: { ...ctx.tenantBranchWhere, status: { not: 'PAID' } },
        select: {
            total: true,
            paidAmount: true,
            status: true,
            invoiceNumber: true,
            createdAt: true,
            supplier: { select: { name: true } },
            items: {
                select: { quantity: true, drug: { select: { tradeName: true } } },
                take: 5,
            },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    if (!pending.length) return '## الطلبيات المعلقة\n✅ لا توجد طلبيات معلقة حالياً.';

    const totalDue = pending.reduce((s, p) => s + (p.total - p.paidAmount), 0);
    const rows = pending.map(p => {
        const remaining = p.total - p.paidAmount;
        const drugs = p.items.map(i => i.drug.tradeName).join('، ') || '—';
        return `- ${p.supplier.name} | ${fmt(p.total)} (متبقي: ${fmt(remaining)}) | ${p.status} | ${fmtDate(p.createdAt)}\n  الأصناف: ${drugs}`;
    });

    return `## الطلبيات المعلقة (${pending.length} فاتورة)\nإجمالي المستحق: ${fmt(totalDue)}\n${rows.join('\n')}`;
}

// ─── Slow Moving Drugs ────────────────────────────────────────────────────────

export async function getSlowMovingDrugs(ctx: AIDataContext): Promise<string> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [inventories, salesData] = await Promise.all([
        prisma.inventory.findMany({
            where: ctx.tenantBranchWhere,
            select: {
                drugId: true,
                minStock: true,
                drug: { select: { tradeName: true } },
                branch: { select: { name: true } },
                batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } },
            },
        }),
        prisma.saleItem.groupBy({
            by: ['drugId'],
            where: { sale: { ...ctx.tenantBranchWhere, createdAt: { gte: ninetyDaysAgo } } },
            _sum: { quantity: true },
        }),
    ]);

    const salesMap = new Map(salesData.map(s => [s.drugId, s._sum.quantity ?? 0]));

    const slowMoving = inventories
        .map(inv => {
            const stock       = inv.batches.reduce((s, b) => s + b.quantity, 0);
            const sold90      = salesMap.get(inv.drugId) ?? 0;
            const dailyRate   = sold90 / 90;
            const daysOfStock = dailyRate > 0 ? Math.round(stock / dailyRate) : null;
            return { name: inv.drug.tradeName, branch: inv.branch.name, stock, sold90, daysOfStock };
        })
        .filter(d => d.stock > 0 && (d.daysOfStock === null || d.daysOfStock > 60))
        .sort((a, b) => (b.daysOfStock ?? 99999) - (a.daysOfStock ?? 99999))
        .slice(0, 15);

    if (!slowMoving.length) return '## الأدوية بطيئة الحركة\nلا توجد أدوية بطيئة الحركة حالياً.';

    const rows = slowMoving.map(d => {
        const supply = d.daysOfStock === null ? 'لا مبيعات خلال 90 يوم' : `${d.daysOfStock} يوم`;
        return `- ${d.name} (${d.branch}): مخزون ${d.stock} | مُباع 90 يوم: ${d.sold90} | عمر المخزون: ${supply}`;
    });

    return `## الأدوية بطيئة الحركة (عمر مخزون > 60 يوم)\n${rows.join('\n')}`;
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export async function getDashboardSummary(ctx: AIDataContext): Promise<string> {
    const now        = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [salesAgg, inventories, expiredCount, openShift, pendingCount, totalItems] = await Promise.all([
        prisma.sale.aggregate({
            _sum: { total: true },
            _count: { id: true },
            where: { ...ctx.tenantBranchWhere, createdAt: { gte: startOfDay, lte: endOfDay } },
        }),
        // تحتاج جلب الكل لحساب الناقص (Prisma لا يدعم column-to-column في where)
        prisma.inventory.findMany({
            where: ctx.tenantBranchWhere,
            select: { minStock: true, batches: { select: { quantity: true } } },
        }),
        prisma.batch.count({
            where: { expiryDate: { lt: now }, quantity: { gt: 0 }, inventory: ctx.tenantBranchWhere },
        }),
        prisma.shift.findFirst({
            where: { ...ctx.tenantBranchWhere, status: 'OPEN' },
            select: { user: { select: { name: true } }, startTime: true },
            orderBy: { startTime: 'desc' },
        }),
        prisma.purchase.count({
            where: { ...ctx.tenantBranchWhere, status: { not: 'PAID' } },
        }),
        prisma.inventory.count({ where: ctx.tenantBranchWhere }),
    ]);

    const lowStockCount = inventories.filter(inv => {
        const total = inv.batches.reduce((s, b) => s + b.quantity, 0);
        return total < inv.minStock;
    }).length;

    const shiftInfo = openShift
        ? `🟢 وردية مفتوحة — ${openShift.user?.name ?? '—'} منذ ${fmtDate(openShift.startTime)}`
        : '🔴 لا توجد وردية مفتوحة حالياً';

    return `## لوحة التحكم — ${fmtDate(now)}
- مبيعات اليوم: ${fmt(salesAgg._sum.total ?? 0)} (${salesAgg._count.id} فاتورة)
- إجمالي الأصناف في المخزن: ${totalItems} صنف
- أدوية ناقصة عن الحد الأدنى: ${lowStockCount} صنف
- دفعات منتهية الصلاحية: ${expiredCount} دفعة ⛔
- طلبيات معلقة: ${pendingCount} طلبية
- ${shiftInfo}

_(للتفاصيل اسأل مثلاً: "ما هي الأدوية الناقصة؟" أو "ما هي الأدوية المنتهية؟")_`;
}

// ─── Drug Info Search ─────────────────────────────────────────────────────────

export async function getDrugInfo(searchTerm: string, ctx: AIDataContext): Promise<string> {
    if (!searchTerm.trim()) return '## البحث عن الدواء\nيرجى تحديد اسم الدواء في سؤالك.';

    const inventories = await prisma.inventory.findMany({
        where: {
            ...ctx.tenantBranchWhere,
            drug: { tradeName: { contains: searchTerm, mode: 'insensitive' } },
        },
        select: {
            price: true,
            cost: true,
            minStock: true,
            drug: { select: { tradeName: true, scientificName: true } },
            branch: { select: { name: true } },
            batches: {
                where: { quantity: { gt: 0 } },
                select: { quantity: true, expiryDate: true, batchNumber: true },
                orderBy: { expiryDate: 'asc' },
            },
        },
        take: 10,
    });

    if (!inventories.length) {
        return `## البحث عن الدواء: "${searchTerm}"\nلم يُعثر على دواء يطابق هذا الاسم في النظام.`;
    }

    const now = Date.now();
    const rows = inventories.map(inv => {
        const totalQty = inv.batches.reduce((s, b) => s + b.quantity, 0);
        const nearExpiry = inv.batches.filter(b =>
            Math.ceil((b.expiryDate.getTime() - now) / 86_400_000) <= 30
        );
        const stockStatus = totalQty === 0 ? '❌ نفد المخزون' : totalQty < inv.minStock ? '⚠️ أقل من الحد الأدنى' : '✅ متوفر';

        const margin = inv.price > 0 ? (((inv.price - inv.cost) / inv.price) * 100).toFixed(1) : '0';
        let info = `**${inv.drug.tradeName}**`;
        if (inv.drug.scientificName) info += ` (${inv.drug.scientificName})`;
        info += ` — ${inv.branch.name}\n`;
        info += `  سعر البيع: ${fmt(inv.price)} | التكلفة: ${fmt(inv.cost)}\n`;
        info += `  ربح الوحدة: ${fmt(inv.price - inv.cost)} | هامش الربح: ${margin}%\n`;
        info += `  الكمية: ${totalQty} وحدة (الحد الأدنى: ${inv.minStock}) ${stockStatus}`;
        if (nearExpiry.length > 0) {
            const expStr = nearExpiry.map(b => {
                const days = Math.ceil((b.expiryDate.getTime() - now) / 86_400_000);
                return `${b.quantity} وحدة تنتهي ${fmtDate(b.expiryDate)} (${days < 0 ? 'منتهية' : `${days} يوم`})`;
            }).join('، ');
            info += `\n  ⚠️ قريبة الانتهاء: ${expStr}`;
        }
        return info;
    });

    return `## معلومات الدواء: "${searchTerm}"\n${rows.join('\n\n')}`;
}

// ─── Purchases Summary ────────────────────────────────────────────────────────

export async function getPurchasesSummary(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const where = { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } };

    const purchases = await prisma.purchase.findMany({
        where,
        select: {
            total: true,
            paidAmount: true,
            status: true,
            invoiceNumber: true,
            createdAt: true,
            supplier: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    if (!purchases.length) return '## المشتريات\nلا توجد مشتريات مسجّلة في هذه الفترة.';

    const totalSpent  = purchases.reduce((s, p) => s + p.total, 0);

    // Outstanding debt to suppliers is tracked on the supplier ledger (balance),
    // NOT on purchase.paidAmount (which is often left at 0 — payments post to the
    // supplier balance instead). Using paidAmount here previously overstated the
    // amount due. Report the real current outstanding from the supplier balances.
    const owedSuppliers = await prisma.supplier.findMany({
        where: { organizationId: ctx.organizationId, balance: { gt: 0 } },
        select: { name: true, balance: true },
        orderBy: { balance: 'desc' },
    });
    const totalOutstanding = owedSuppliers.reduce((s, sup) => s + sup.balance, 0);

    // Top items by purchased quantity (cost is a UNIT price, so summing it is
    // meaningless — rank by quantity instead).
    const topItems = await prisma.purchaseItem.groupBy({
        by: ['drugId'],
        where: { purchase: where },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
    });

    const drugIds = topItems.map(i => i.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: drugIds } },
        select: { id: true, tradeName: true },
    });
    const drugMap = new Map(drugs.map(d => [d.id, d.tradeName]));

    const recentRows = purchases.slice(0, 10).map(p =>
        `- ${p.supplier.name} | ${fmt(p.total)} | مدفوع: ${fmt(p.paidAmount)} | ${p.status === 'PAID' ? '✅ مدفوعة' : '🔴 مستحقة'} | ${fmtDate(p.createdAt)}`
    );
    const topRows = topItems.map(i =>
        `- ${drugMap.get(i.drugId) ?? '—'}: ${i._sum.quantity ?? 0} وحدة`
    );

    const owedRows = owedSuppliers.map(s => `- ${s.name}: ${fmt(s.balance)}`);

    return `## المشتريات (${fmtDate(from)} — ${fmtDate(to)})
- إجمالي قيمة المشتريات خلال الفترة: ${fmt(totalSpent)} (${purchases.length} فاتورة)

### الرصيد المستحق للموردين حالياً (من كشف الحساب)
الإجمالي المستحق: ${fmt(totalOutstanding)}${owedRows.length ? '\n' + owedRows.join('\n') : '\n- لا توجد مستحقات حالياً (جميع الموردين مسدّدون).'}
ملاحظة: «إجمالي قيمة المشتريات» هو قيمة الفواتير خلال الفترة بغضّ النظر عن السداد، أما «الرصيد المستحق» فهو ما تبقّى فعلياً على الصيدلية للموردين حسب كشف الحساب.

### آخر الفواتير
${recentRows.join('\n')}

### أكثر الأدوية المشتراة (بالكمية)
${topRows.length ? topRows.join('\n') : 'لا بيانات'}`;
}

// ─── Suppliers List ───────────────────────────────────────────────────────────

export async function getSuppliersList(ctx: AIDataContext): Promise<string> {
    const suppliers = await prisma.supplier.findMany({
        where: { organizationId: ctx.organizationId },
        select: { name: true, phone: true, balance: true },
        orderBy: { name: 'asc' },
    });

    if (!suppliers.length) return '## الموردون\nلا يوجد موردون مسجّلون في النظام.';

    const rows = suppliers.map(s => {
        const debt = s.balance > 0 ? ` | دين مستحق: ${fmt(s.balance)}` : ' | لا دين';
        return `- ${s.name}${s.phone ? ` (${s.phone})` : ''}${debt}`;
    });
    return `## قائمة الموردين (${suppliers.length} مورد)\n${rows.join('\n')}`;
}

// ─── Supplier Debts ───────────────────────────────────────────────────────────

export async function getSupplierDebts(ctx: AIDataContext): Promise<string> {
    // balance > 0 means we owe the supplier (incremented on unpaid purchase)
    const suppliers = await prisma.supplier.findMany({
        where: { balance: { gt: 0 }, organizationId: ctx.organizationId },
        select: { name: true, phone: true, balance: true },
        orderBy: { balance: 'desc' },
        take: 10,
    });

    if (!suppliers.length) return '## ديون الموردين\nلا توجد ديون مستحقة للموردين حالياً.';

    const total = suppliers.reduce((s, sup) => s + sup.balance, 0);
    const rows  = suppliers.map(s => `- ${s.name}${s.phone ? ` (${s.phone})` : ''}: ${fmt(s.balance)}`);
    return `## ديون الموردين (أعلى 10)\n${rows.join('\n')}\n- **إجمالي المستحق للموردين: ${fmt(total)}**`;
}

// ─── Inventory Overview (counts) ───────────────────────────────────────────────
// Answers "كم عدد الأدوية؟ / كم صنف لديه مخزون؟". Stock lives only in batches, so
// a drug imported via Excel without an opening quantity is a real inventory record
// with zero on-hand units — both numbers are reported so the count is unambiguous.
export async function getInventoryOverview(ctx: AIDataContext): Promise<string> {
    const inventories = await prisma.inventory.findMany({
        where: ctx.tenantBranchWhere,
        select: { price: true, batches: { select: { quantity: true } } },
    });

    const totalItems = inventories.length;
    let inStock = 0;
    let outOfStock = 0;
    let totalUnits = 0;
    let stockValue = 0;
    for (const inv of inventories) {
        const qty = inv.batches.reduce((s, b) => s + b.quantity, 0);
        totalUnits += qty;
        stockValue += qty * inv.price;
        if (qty > 0) inStock++;
        else outOfStock++;
    }

    return `## نظرة عامة على المخزون
- إجمالي الأصناف المسجّلة في المخزون: ${totalItems} صنف
- أصناف لها مخزون فعلي (الكمية > 0): ${inStock} صنف
- أصناف نفد مخزونها (الكمية = 0): ${outOfStock} صنف
- إجمالي الوحدات المتوفرة: ${totalUnits.toLocaleString('ar-IQ')} وحدة
- القيمة التقديرية للمخزون (بسعر البيع): ${fmt(stockValue)}`;
}

// ─── Peak Sales Hours ──────────────────────────────────────────────────────────
export async function getPeakHours(from: Date, to: Date, ctx: AIDataContext): Promise<string> {
    const sales = await prisma.sale.findMany({
        where: { ...ctx.tenantBranchWhere, createdAt: { gte: from, lte: to } },
        select: { createdAt: true, total: true },
    });

    if (!sales.length) {
        return `## ساعات الذروة (${fmtDate(from)} — ${fmtDate(to)})\nلا توجد مبيعات في هذه الفترة لتحليل ساعات الذروة.`;
    }

    const buckets = Array.from({ length: 24 }, () => ({ count: 0, total: 0 }));
    for (const s of sales) {
        // Iraq local hour (UTC+3, no DST)
        const hour = new Date(s.createdAt.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
        buckets[hour].count += 1;
        buckets[hour].total += s.total;
    }

    const ranked = buckets
        .map((b, h) => ({ h, ...b }))
        .filter(b => b.count > 0)
        .sort((a, b) => b.total - a.total);

    const fmtHour = (h: number) =>
        `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`;

    const rows = ranked.slice(0, 6).map((b, i) =>
        `${i + 1}. ${fmtHour(b.h)} → ${b.count} فاتورة بقيمة ${fmt(b.total)}`,
    );

    return `## ساعات الذروة في المبيعات (${fmtDate(from)} — ${fmtDate(to)})
أكثر الساعات مبيعاً (بتوقيت بغداد):
${rows.join('\n')}`;
}

// ─── Supplier Price Comparison for Low-Stock Drugs ─────────────────────────────
// PurchaseItem.cost is a UNIT price (total = Σ quantity×cost), so historical unit
// prices per supplier can be compared directly to find the cheapest source.
export async function getSupplierPriceComparison(ctx: AIDataContext): Promise<string> {
    const inventories = await prisma.inventory.findMany({
        where: ctx.tenantBranchWhere,
        select: {
            drugId: true,
            minStock: true,
            drug: { select: { tradeName: true } },
            batches: { select: { quantity: true } },
        },
    });

    const lowDrugs = inventories
        .map(inv => ({
            drugId: inv.drugId,
            name: inv.drug.tradeName,
            current: inv.batches.reduce((s, b) => s + b.quantity, 0),
            min: inv.minStock,
        }))
        .filter(inv => inv.current < inv.min);

    if (!lowDrugs.length) {
        return '## مقارنة أسعار الموردين للأدوية الناقصة\nلا توجد أدوية ناقصة حالياً لمقارنة أسعار مورديها.';
    }

    const drugIds = lowDrugs.map(d => d.drugId);
    const items = await prisma.purchaseItem.findMany({
        where: { drugId: { in: drugIds }, purchase: ctx.tenantBranchWhere },
        select: {
            drugId: true,
            cost: true, // unit price
            purchase: { select: { createdAt: true, supplier: { select: { name: true } } } },
        },
        orderBy: { purchase: { createdAt: 'desc' } },
    });

    // drugId → supplierName → latest unit price seen
    const byDrug = new Map<string, Map<string, number>>();
    for (const it of items) {
        const supplier = it.purchase.supplier?.name ?? 'غير معروف';
        if (!byDrug.has(it.drugId)) byDrug.set(it.drugId, new Map());
        const sup = byDrug.get(it.drugId)!;
        // keep the most recent price (items are ordered desc by date)
        if (!sup.has(supplier)) sup.set(supplier, it.cost);
    }

    const sections = lowDrugs.map(d => {
        const sup = byDrug.get(d.drugId);
        if (!sup || sup.size === 0) {
            return `### ${d.name} (متوفر ${d.current} / الحد ${d.min})\nلا يوجد سجل شراء سابق لهذا الدواء — لا يمكن مقارنة الأسعار.`;
        }
        const sorted = Array.from(sup.entries()).sort((a, b) => a[1] - b[1]);
        const rows = sorted.map(([name, price], i) =>
            `${i === 0 ? '✅ الأرخص' : '•'} ${name}: ${fmt(price)} للوحدة`,
        );
        return `### ${d.name} (متوفر ${d.current} / الحد ${d.min})\n${rows.join('\n')}`;
    });

    return `## مقارنة أسعار الموردين للأدوية الناقصة
(تعتمد على آخر سعر شراء مسجّل لكل مورد)
${sections.join('\n\n')}`;
}

// ─── Drugs Ranked by Profit Margin ─────────────────────────────────────────────
// Per-drug margin = (سعر البيع − التكلفة) ÷ سعر البيع. Requires both price>0 and
// cost>0 (a drug imported via Excel with cost=0 has no real margin to compute).
export async function getTopMarginDrugs(
    ctx: AIDataContext,
    order: 'top' | 'bottom' = 'top',
    limit = 15,
): Promise<string> {
    const inventories = await prisma.inventory.findMany({
        where: ctx.tenantBranchWhere,
        select: {
            price: true,
            cost: true,
            drug: { select: { tradeName: true } },
            branch: { select: { name: true } },
        },
    });

    const ranked = inventories
        .filter(inv => inv.price > 0 && inv.cost > 0)
        .map(inv => ({
            name: inv.drug.tradeName,
            branch: inv.branch.name,
            price: inv.price,
            cost: inv.cost,
            profit: inv.price - inv.cost,
            margin: ((inv.price - inv.cost) / inv.price) * 100,
        }))
        .sort((a, b) => (order === 'top' ? b.margin - a.margin : a.margin - b.margin))
        .slice(0, limit);

    if (!ranked.length) {
        return '## هامش الربح حسب الدواء\nلا تتوفر بيانات تكلفة وسعر كافية (سعر بيع وتكلفة أكبر من صفر) لحساب الهوامش. تأكّد من إدخال سعر التكلفة للأدوية.';
    }

    const title = order === 'top' ? 'أعلى الأدوية هامش ربح' : 'أدنى الأدوية هامش ربح';
    const rows = ranked.map((d, i) =>
        `${i + 1}. ${d.name} (${d.branch}): هامش ${d.margin.toFixed(1)}% | بيع ${fmt(d.price)} / تكلفة ${fmt(d.cost)} / ربح الوحدة ${fmt(d.profit)}`,
    );
    return `## ${title} (لكل وحدة)\n${rows.join('\n')}`;
}
