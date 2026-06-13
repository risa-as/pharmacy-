export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { logAudit } from '@/app/lib/audit';

interface ImportRow {
    name?: string;
    tradeName?: string;
    barcode?: string;
    scientificName?: string;
    origin?: string;
    manufacturer?: string;
}

// POST: bulk import/update GLOBAL drugs (organizationId = null) — SUPER_ADMIN only.
// Match by barcode: existing global drugs are updated, new ones are created.
export async function POST(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    if (tenantCtx.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
            { success: false, errors: ['غير مصرح — هذه الميزة لمدير المنصة فقط'], imported: 0, updated: 0, total: 0 },
            { status: 403 }
        );
    }

    try {
        const body = await req.json();
        const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
        if (rows.length === 0) {
            return NextResponse.json({ success: false, errors: ['لا توجد بيانات في الملف'], imported: 0, updated: 0, total: 0 });
        }

        const errors: string[] = [];

        // Normalize + validate
        const clean = rows.map((r, i) => ({
            i,
            tradeName: String(r.tradeName ?? r.name ?? '').trim(),
            barcode: String(r.barcode ?? '').trim(),
            scientificName: String(r.scientificName ?? '').trim(),
            origin: String(r.origin ?? r.manufacturer ?? '').trim(),
        }));

        const valid = clean.filter((r) => {
            if (!r.tradeName) { errors.push(`الصف ${r.i + 1}: الاسم التجاري مفقود`); return false; }
            if (!r.barcode) { errors.push(`الصف ${r.i + 1} (${r.tradeName}): الباركود مفقود — مطلوب للمطابقة`); return false; }
            return true;
        });

        // Map existing global drugs by barcode
        const barcodes = Array.from(new Set(valid.map((r) => r.barcode)));
        const existing = await prisma.globalDrug.findMany({
            where: { organizationId: null, barcode: { in: barcodes } },
            select: { id: true, barcode: true },
        });
        const existingMap = new Map(existing.map((d: any) => [d.barcode, d.id]));

        // Split into updates (existing) and creates (new, deduped within file)
        const updateRows = valid.filter((r) => existingMap.has(r.barcode));
        const createSeen = new Set<string>();
        const createRows = valid.filter((r) => {
            if (existingMap.has(r.barcode)) return false;
            if (createSeen.has(r.barcode)) return false;
            createSeen.add(r.barcode);
            return true;
        });

        // ── Updates (chunked) ──
        let updated = 0;
        const CHUNK = 50;
        for (let i = 0; i < updateRows.length; i += CHUNK) {
            const chunk = updateRows.slice(i, i + CHUNK);
            const results = await Promise.allSettled(
                chunk.map((r) =>
                    prisma.globalDrug.update({
                        where: { id: existingMap.get(r.barcode)! },
                        data: {
                            tradeName: r.tradeName,
                            ...(r.scientificName ? { scientificName: r.scientificName } : {}),
                            ...(r.origin ? { origin: r.origin } : {}),
                        },
                    })
                )
            );
            results.forEach((res, idx) => {
                if (res.status === 'fulfilled') updated++;
                else errors.push(`تعذّر تحديث ${chunk[idx].tradeName}: ${(res.reason as any)?.message ?? 'خطأ'}`);
            });
        }

        // ── Creates (bulk) ──
        let imported = 0;
        if (createRows.length > 0) {
            const created = await prisma.globalDrug.createMany({
                data: createRows.map((r) => ({
                    barcode: r.barcode,
                    tradeName: r.tradeName,
                    scientificName: r.scientificName || r.tradeName,
                    origin: r.origin || null,
                    organizationId: null,
                })),
            });
            imported = created.count;
        }

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'SuperAdmin',
            action: 'IMPORT',
            entity: 'GLOBAL_DRUG',
            details: JSON.stringify({ imported, updated, total: rows.length, errors: errors.length }),
        });

        return NextResponse.json({ success: true, imported, updated, total: rows.length, errors });
    } catch (e: any) {
        console.error('Global drug import error:', e);
        return NextResponse.json(
            { success: false, errors: [e.message || 'حدث خطأ غير متوقع'], imported: 0, updated: 0, total: 0 },
            { status: 500 }
        );
    }
}
