export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { logAudit } from '@/app/lib/audit';

/**
 * Expenses the system books itself (purchase invoices, stocktake losses, damaged
 * stock). They mirror another record, so editing or deleting them here would
 * leave the books inconsistent.
 */
const SYSTEM_CATEGORIES = ['مشتريات بضاعة', 'نواقص وتوالف الجرد', 'إتلاف مخزون'];

type Scope = { branchId: string; category: string } | NextResponse;

/** Loads the expense and refuses anything outside the caller's scope or booked by the system. */
async function loadEditable(id: string): Promise<Scope> {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    const { user, organizationId } = tenantCtx;

    if (!tenantCtx.userPermissions.canCreateExpense) {
        return NextResponse.json({ message: 'ليس لديك صلاحية لتعديل المصروفات.' }, { status: 403 });
    }

    const existing = await prisma.expense.findUnique({
        where: { id },
        select: { branchId: true, category: true, branch: { select: { organizationId: true } } },
    });
    if (!existing) return NextResponse.json({ message: 'المصروف غير موجود.' }, { status: 404 });

    const inScope = user.role === 'SUPER_ADMIN'
        ? true
        : user.branchId
            ? existing.branchId === user.branchId
            : organizationId
                ? existing.branch?.organizationId === organizationId
                : false;
    if (!inScope) return NextResponse.json({ message: 'لا يمكنك تعديل هذا المصروف.' }, { status: 403 });

    if (SYSTEM_CATEGORIES.includes(existing.category)) {
        return NextResponse.json(
            { message: 'هذا المصروف مسجَّل تلقائياً من عملية أخرى (شراء أو جرد)، ولا يمكن تعديله أو حذفه.' },
            { status: 400 },
        );
    }

    return { branchId: existing.branchId, category: existing.category };
}

async function actor() {
    const ctx = await getTenantContext();
    return ctx instanceof NextResponse ? null : ctx.user;
}

/** PATCH /api/expenses/[id] — amount, category and description. */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    try {
        const scope = await loadEditable(id);
        if (scope instanceof NextResponse) return scope;

        const body = await req.json().catch(() => null);
        const amount = Number(body?.amount);
        const category = typeof body?.category === 'string' ? body.category.trim() : '';
        const description = typeof body?.description === 'string' ? body.description.trim() : '';

        if (!Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ message: 'المبلغ يجب أن يكون أكبر من صفر.' }, { status: 400 });
        }
        if (!category) return NextResponse.json({ message: 'التصنيف مطلوب.' }, { status: 400 });

        const expense = await prisma.expense.update({
            where: { id },
            data: { amount, category, description: description || null },
        });

        const user = await actor();
        if (user) await logAudit({
            userId: user.id, userName: user.name ?? user.email ?? 'Unknown',
            action: 'UPDATE', entity: 'EXPENSE', entityId: id,
            details: JSON.stringify({ amount, category, source: 'mobile' }),
            branchId: scope.branchId,
        });

        return NextResponse.json(expense);
    } catch (error) {
        console.error('PATCH /api/expenses/[id] error:', error);
        return NextResponse.json({ message: 'تعذّر تعديل المصروف.' }, { status: 500 });
    }
}

/** DELETE /api/expenses/[id] */
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    try {
        const scope = await loadEditable(id);
        if (scope instanceof NextResponse) return scope;

        const expense = await prisma.expense.delete({ where: { id } });

        const user = await actor();
        if (user) await logAudit({
            userId: user.id, userName: user.name ?? user.email ?? 'Unknown',
            action: 'DELETE', entity: 'EXPENSE', entityId: id,
            details: JSON.stringify({ amount: expense.amount, category: expense.category, source: 'mobile' }),
            branchId: scope.branchId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE /api/expenses/[id] error:', error);
        return NextResponse.json({ message: 'تعذّر حذف المصروف.' }, { status: 500 });
    }
}
