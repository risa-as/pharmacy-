import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import jsPDF from "jspdf";
import "jspdf-autotable";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

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

        // العنوان
        doc.setFontSize(20);
        doc.text("Expiry Report - Faramace", 105, 20, { align: "center" });

        doc.setFontSize(12);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 105, 30, { align: "center" });
        doc.text(`Showing: Items expiring within 90 days`, 105, 38, { align: "center" });

        // إحصائيات
        const now = new Date();
        const expiredCount = batches.filter(b => new Date(b.expiryDate) < now).length;
        const expiringCount = batches.filter(b => new Date(b.expiryDate) >= now).length;

        doc.setFontSize(14);
        doc.setTextColor(220, 38, 38); // أحمر
        doc.text(`Already Expired: ${expiredCount}`, 20, 55);
        doc.setTextColor(234, 179, 8); // أصفر
        doc.text(`Expiring Soon: ${expiringCount}`, 20, 65);
        doc.setTextColor(0, 0, 0); // أسود

        // جدول
        const tableData = batches.map((batch, index) => {
            const drug = drugMap.get(batch.inventory.drugId);
            const expiryDate = new Date(batch.expiryDate);
            const isExpired = expiryDate < now;
            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            return [
                (index + 1).toString(),
                drug?.tradeName || 'Unknown',
                batch.batchNumber,
                batch.inventory.branch?.name || 'N/A',
                batch.quantity.toString(),
                expiryDate.toLocaleDateString('en-US'),
                isExpired ? 'EXPIRED' : `${daysLeft} days`
            ];
        });

        doc.autoTable({
            head: [['#', 'Drug Name', 'Batch', 'Branch', 'Qty', 'Expiry Date', 'Status']],
            body: tableData,
            startY: 80,
            styles: { fontSize: 9 },
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
