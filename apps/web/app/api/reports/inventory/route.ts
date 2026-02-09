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
        const inventory = await prisma.inventory.findMany({
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

        // العنوان
        doc.setFontSize(20);
        doc.text("Inventory Report - Faramace", 105, 20, { align: "center" });

        doc.setFontSize(12);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 105, 30, { align: "center" });

        // إحصائيات
        const totalItems = inventory.length;
        const lowStockItems = inventory.filter(i => {
            const totalQty = i.batches.reduce((acc: number, b) => acc + b.quantity, 0);
            return totalQty <= i.minStock;
        }).length;

        doc.setFontSize(14);
        doc.text(`Total Products: ${totalItems}`, 20, 50);
        doc.text(`Low Stock Items: ${lowStockItems}`, 20, 60);

        // جدول المخزون
        const tableData = inventory.map((item, index) => {
            const drug = drugMap.get(item.drugId);
            const totalQty = item.batches.reduce((acc: number, b) => acc + b.quantity, 0);
            const status = totalQty <= item.minStock ? 'LOW' : totalQty >= item.maxStock ? 'OVER' : 'OK';

            return [
                (index + 1).toString(),
                drug?.tradeName || 'Unknown',
                drug?.barcode || 'N/A',
                item.branch?.name || 'N/A',
                totalQty.toString(),
                `${item.minStock} / ${item.maxStock}`,
                status
            ];
        });

        doc.autoTable({
            head: [['#', 'Drug Name', 'Barcode', 'Branch', 'Qty', 'Min/Max', 'Status']],
            body: tableData,
            startY: 75,
            styles: { fontSize: 9 },
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
