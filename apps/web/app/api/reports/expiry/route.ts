import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { BILINGUAL_HEADERS, STATUS_LABELS, formatDateArabic, sanitizeForPdf } from "@/app/lib/utils/pdf-arabic";

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
        // تاريخ بعد 90 يوم من الآن
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

        const batches = await prisma.batch.findMany({
            where: {
                expiryDate: { lte: ninetyDaysFromNow }
            },
            include: {
                inventory: {
                    include: {
                        branch: true
                    }
                }
            },
            orderBy: { expiryDate: 'asc' }
        });

        // جلب الأدوية
        const drugIds = batches.map(b => b.inventory.drugId);
        const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
        const drugs = await prisma.globalDrug.findMany({
            where: { id: { in: uniqueDrugIds } },
            select: { id: true, tradeName: true, barcode: true }
        });
        const drugMap = new Map(drugs.map(d => [d.id, d]));

        // إنشاء PDF
        const doc = new jsPDF();
        const h = BILINGUAL_HEADERS.expiry;

        // العنوان (bilingual)
        doc.setFontSize(18);
        doc.text(h.title, 105, 20, { align: "center" });

        doc.setFontSize(10);
        doc.text(h.subtitle, 105, 28, { align: "center" });
        doc.text(formatDateArabic(new Date()), 105, 34, { align: "center" });

        // إحصائيات
        const now = new Date();
        const expiredCount = batches.filter(b => new Date(b.expiryDate) < now).length;
        const expiringCount = batches.filter(b => new Date(b.expiryDate) >= now).length;

        doc.setFontSize(12);
        doc.setTextColor(220, 38, 38);
        doc.text(`Already Expired: ${expiredCount}`, 20, 50);
        doc.setTextColor(234, 179, 8);
        doc.text(`Expiring Soon: ${expiringCount}`, 20, 58);
        doc.setTextColor(0, 0, 0);

        // جدول
        const tableData = batches.map((batch, index) => {
            const drug = drugMap.get(batch.inventory.drugId);
            const expiryDate = new Date(batch.expiryDate);
            const isExpired = expiryDate < now;
            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            return [
                (index + 1).toString(),
                sanitizeForPdf(drug?.tradeName) || 'Unknown',
                sanitizeForPdf(batch.batchNumber),
                sanitizeForPdf(batch.inventory.branch?.name) || 'N/A',
                batch.quantity.toString(),
                formatDateArabic(expiryDate),
                isExpired ? STATUS_LABELS.EXPIRED : `${daysLeft} days`
            ];
        });

        doc.autoTable({
            head: [h.columns],
            body: tableData,
            startY: 68,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [239, 68, 68] },
            theme: 'striped'
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="expiry-report.pdf"'
            }
        });
    } catch (error) {
        console.error("Error generating expiry report:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
