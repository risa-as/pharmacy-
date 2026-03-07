export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { BILINGUAL_HEADERS, STATUS_LABELS, formatDateArabic, sanitizeForPdf } from "@/app/lib/utils/pdf-arabic";
import { getTenantContext } from '@/app/lib/tenant-utils';

declare module "jspdf" {
    interface jsPDF {
        autoTable: (options: {
            head: string[][];
            body: (string | number)[][];
            startY?: number;
            styles?: Record<string, unknown>;
            headStyles?: Record<string, unknown>;
            theme?: string;
        }) => jsPDF;
    }
}

export async function GET() {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const inventory = await prisma.inventory.findMany({
            where: tenantBranchWhere,
            include: {
                branch: true,
                batches: true
            },
            orderBy: { drugId: 'asc' }
        });

        // جلب الأدوية
        const drugIds = inventory.map(i => i.drugId);
        const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: uniqueDrugIds } },
            select: { id: true, tradeName: true, barcode: true }
        });
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        // إنشاء PDF
        const doc = new jsPDF();
        const h = BILINGUAL_HEADERS.inventory;

        // العنوان (bilingual)
        doc.setFontSize(18);
        doc.text(h.title, 105, 20, { align: "center" });

        doc.setFontSize(10);
        doc.text(h.subtitle, 105, 28, { align: "center" });
        doc.text(formatDateArabic(new Date()), 105, 34, { align: "center" });

        // إحصائيات
        const totalItems = inventory.length;
        const lowStockItems = inventory.filter(i => {
            const totalQty = i.batches.reduce((acc: number, b) => acc + b.quantity, 0);
            return totalQty <= i.minStock;
        }).length;

        doc.setFontSize(12);
        doc.text(`Total Products: ${totalItems}`, 20, 50);
        doc.text(`Low Stock Items: ${lowStockItems}`, 20, 58);

        // جدول المخزون
        const tableData = inventory.map((item, index) => {
            const drug = drugMap.get(item.drugId);
            const totalQty = item.batches.reduce((acc: number, b) => acc + b.quantity, 0);
            const status = totalQty <= item.minStock
                ? STATUS_LABELS.LOW
                : totalQty >= item.maxStock
                    ? STATUS_LABELS.OVER
                    : STATUS_LABELS.OK;

            return [
                (index + 1).toString(),
                sanitizeForPdf(drug?.tradeName) || 'Unknown',
                sanitizeForPdf(drug?.barcode) || 'N/A',
                sanitizeForPdf(item.branch?.name) || 'N/A',
                totalQty.toString(),
                `${item.minStock} / ${item.maxStock}`,
                status
            ];
        });

        doc.autoTable({
            head: [h.columns],
            body: tableData,
            startY: 68,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [34, 197, 94] },
            theme: 'striped'
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="inventory-report.pdf"'
            }
        });
    } catch (error) {
        console.error("Error generating inventory report:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
