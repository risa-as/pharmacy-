"use server";

import { prisma } from "@/app/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


export async function fetchReportData(
    type: "sales" | "purchases" | "inventory" | "expenses",
    startDate?: string,
    endDate?: string
) {
    console.log("Fetching report data:", { type, startDate, endDate });
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return [];
        const { tenantBranchWhere } = tenantCtx;

        const start = startDate ? startOfDay(new Date(startDate)) : undefined;
        const end = endDate ? endOfDay(new Date(endDate)) : undefined;

        // Construct dynamic date filter
        const buildDateFilter = (field: string) => {
            if (!start && !end) return {}; // No filter

            const filter: any = {};
            if (start) filter.gte = start;
            if (end) filter.lte = end;

            return { [field]: filter };
        };

        const salesDateFilter = buildDateFilter("createdAt");
        const purchasesDateFilter = buildDateFilter("createdAt");
        const expensesDateFilter = buildDateFilter("date");

        if (type === "sales") {
            const data = await prisma.sale.findMany({
                where: { ...salesDateFilter, ...tenantBranchWhere },
                include: {
                    user: { select: { name: true } },
                    patient: { select: { name: true } },
                    items: {
                        include: {
                            drug: { select: { tradeName: true } },
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            // Return flattened structure for detailed report
            const flattenedData = data.flatMap((sale) =>
                sale.items.map((item: any) => ({
                    "التاريخ": sale.createdAt.toISOString().split("T")[0],
                    "رقم الفاتورة": sale.id.substring(0, 8), // Shorten ID for display
                    "اسم البائع": sale.user?.name || "غير محدد",
                    "اسم المريض": sale.patient?.name || "زائر",
                    "اسم الدواء": item.drug.tradeName,
                    "العدد": item.quantity,
                    "سعر الوحدة": item.price,
                    "السعر الكلي": item.price * item.quantity,
                }))
            );

            return flattenedData;
        }

        if (type === "purchases") {
            const data = await prisma.purchase.findMany({
                where: { ...purchasesDateFilter, ...tenantBranchWhere },
                include: {
                    supplier: { select: { name: true } },
                    items: {
                        include: {
                            drug: { select: { tradeName: true } },
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
            });

            const flattenedData = data.flatMap((purchase) =>
                purchase.items.length > 0 ? purchase.items.map((item: any) => ({
                    "التاريخ": purchase.createdAt.toISOString().split("T")[0],
                    "رقم الفاتورة": purchase.invoiceNumber || purchase.id.substring(0, 8),
                    "المورد": purchase.supplier.name,
                    "اسم الدواء": item.drug.tradeName,
                    "الكمية": item.quantity,
                    "التكلفة": item.cost,
                    "تاريخ الانتهاء": item.expiryDate ? item.expiryDate.toISOString().split("T")[0] : "-",
                    "رقم التشغيلة": item.batchNumber || "-",
                    "الحالة": purchase.status === "COMPLETED" ? "مكتمل" : "قيد الانتظار",
                })) : [{
                    "التاريخ": purchase.createdAt.toISOString().split("T")[0],
                    "رقم الفاتورة": purchase.invoiceNumber || purchase.id.substring(0, 8),
                    "المورد": purchase.supplier.name,
                    "اسم الدواء": "-",
                    "الكمية": 0,
                    "التكلفة": purchase.total,
                    "تاريخ الانتهاء": "-",
                    "رقم التشغيلة": "-",
                    "الحالة": purchase.status === "COMPLETED" ? "مكتمل" : "قيد الانتظار",
                }]
            );

            return flattenedData;
        }

        if (type === "inventory") {
            const data = await prisma.inventory.findMany({
                where: tenantBranchWhere,
                include: {
                    drug: { select: { tradeName: true, barcode: true } },
                    branch: { select: { name: true } },
                    batches: { select: { quantity: true, expiryDate: true, batchNumber: true } },
                },
            });

            // Flatten inventory by batches to show detailed stock
            const flattenedData = data.flatMap((item) =>
                item.batches.length > 0 ? item.batches.map((batch: any) => ({
                    "اسم الدواء": item.drug.tradeName,
                    "الباركود": item.drug.barcode,
                    "الفرع": item.branch.name,
                    "الكمية": batch.quantity,
                    "سعر البيع": item.price,
                    "سعر التكلفة": item.cost,
                    "تاريخ الانتهاء": batch.expiryDate.toISOString().split("T")[0],
                    "رقم التشغيلة": batch.batchNumber,
                })) : [{
                    "اسم الدواء": item.drug.tradeName,
                    "الباركود": item.drug.barcode,
                    "الفرع": item.branch.name,
                    "الكمية": 0,
                    "سعر البيع": item.price,
                    "سعر التكلفة": item.cost,
                    "تاريخ الانتهاء": "-",
                    "رقم التشغيلة": "-",
                }]
            );

            return flattenedData;
        }

        if (type === "expenses") {
            const data = await prisma.expense.findMany({
                where: { ...expensesDateFilter, ...tenantBranchWhere },
                include: {
                    branch: { select: { name: true } },
                },
                orderBy: { date: "desc" },
            });

            return data.map((item: any) => ({
                "التاريخ": item.date.toISOString().split("T")[0],
                "الفئة": item.category,
                "المبلغ": item.amount,
                "الفرع": item.branch.name,
                "الوصف": item.description || "-",
            }));
        }

        return [];
    } catch (error) {
        console.error("Error fetching report data:", error);
        throw new Error("فشل في جلب بيانات التقرير. يرجى المحاولة مرة أخرى.");
    }
}
