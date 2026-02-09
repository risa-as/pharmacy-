import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import jsPDF from "jspdf";
import "jspdf-autotable";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// تعريف النوع لـ autoTable
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
        // جلب المبيعات من آخر 30 يوم
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sales = await prisma.sale.findMany({
            where: {
                createdAt: { gte: thirtyDaysAgo }
            },
            include: {
                items: true,
                branch: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // إنشاء PDF
        const doc = new jsPDF();

        // العنوان
        doc.setFontSize(20);
        doc.text("Sales Report - Faramace", 105, 20, { align: "center" });

        doc.setFontSize(12);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 105, 30, { align: "center" });
        doc.text(`Period: Last 30 days`, 105, 38, { align: "center" });

        // إحصائيات
        const totalSales = sales.reduce((acc, sale) => acc + sale.total, 0);
        const totalItems = sales.reduce((acc, sale) => acc + sale.items.length, 0);

        doc.setFontSize(14);
        doc.text(`Total Sales: ${totalSales.toLocaleString()} IQD`, 20, 55);
        doc.text(`Number of Transactions: ${sales.length}`, 20, 65);
        doc.text(`Total Items Sold: ${totalItems}`, 20, 75);

        // جدول المبيعات
        const tableData = sales.map((sale, index) => [
            (index + 1).toString(),
            new Date(sale.createdAt).toLocaleDateString('en-US'),
            sale.branch?.name || 'N/A',
            sale.items.length.toString(),
            sale.total.toLocaleString() + ' IQD'
        ]);

        doc.autoTable({
            head: [['#', 'Date', 'Branch', 'Items', 'Total']],
            body: tableData,
            startY: 90,
            styles: { fontSize: 10 },
            headStyles: { fillColor: [59, 130, 246] },
            theme: 'striped'
        });

        // تحويل إلى buffer
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="sales-report.pdf"'
            }
        });
    } catch (error) {
        console.error("Error generating sales report:", error);
        return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }
}
