export const dynamic = "force-dynamic";

import { ClipboardList } from "lucide-react";
import { Metadata } from "next";
import StocktakeForm from "@/app/ui/inventory/stocktakes/stocktake-form";
import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export const metadata: Metadata = {
  title: "تسوية الجرد | Faramace",
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = await getTenantContext();
  if (ctx instanceof NextResponse || !ctx.userPermissions.canDoStocktake)
    notFound();

  const stocktake = await prisma.stocktake.findFirst({
    where: { AND: [ctx.tenantBranchWhere, { id: params.id }] },
    include: {
      items: true, // currently saved items if it was started before
    },
  });

  if (!stocktake) {
    notFound();
  }

  // Get all current inventory for this branch to start the counting process
  const inventory = await prisma.inventory.findMany({
    where: { branchId: stocktake.branchId },
    include: {
      drug: true,
      batches: {
        where: {
          OR: [
            { quantity: { gt: 0 } },
            { id: { in: stocktake.items.map((item) => item.batchId) } },
          ],
        }, // Keep counted batches visible after their quantity reaches zero.
      },
    },
  });

  // Flatten the inventory into a list of batches with drug info
  const allBatches = inventory.flatMap((inv: any) =>
    inv.batches.map((batch: any) => ({
      batchId: batch.id,
      drugName: inv.drug.tradeName,
      barcode: inv.drug.barcode,
      scientificName: inv.drug.scientificName,
      systemQuantity:
        stocktake.items.find((item: any) => item.batchId === batch.id)
          ?.systemQuantity ?? batch.quantity,
      costPrice:
        stocktake.items.find((item: any) => item.batchId === batch.id)
          ?.costPrice ?? batch.costPrice,
      expiryDate: batch.expiryDate,
      // Default actual to system initially, unless we saved a draft
      actualQuantity:
        stocktake.items.find((item: any) => item.batchId === batch.id)
          ?.actualQuantity ?? batch.quantity,
      reason:
        stocktake.items.find((item: any) => item.batchId === batch.id)
          ?.reason ?? "",
    })),
  );

  return (
    <div className="w-full">
      <div className="bg-card p-4 md:p-6 mb-6 rounded-lg border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
            تسوية الجرد
          </h1>
          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
            الرقم المرجعي:{" "}
            <bdi className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 font-mono font-semibold text-primary">{stocktake.documentNumber}</bdi>
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-bold ${
              stocktake.status === "PENDING"
                ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
            }`}
          >
            {stocktake.status === "PENDING"
              ? "مسودة"
              : stocktake.status === "REVIEW"
                ? "بانتظار اعتماد المدير"
                : stocktake.status === "CANCELLED"
                  ? "ملغى"
                  : "مكتمل ومُرحّل"}
          </span>
        </div>
      </div>

      <StocktakeForm
        stocktakeId={stocktake.id}
        initialData={
          stocktake.status === "PENDING"
            ? allBatches
            : allBatches.filter((batch) =>
                stocktake.items.some((item) => item.batchId === batch.batchId),
              )
        }
        isCompleted={stocktake.status !== "PENDING"}
        review={stocktake.status === "REVIEW"}
        canReview={["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role)}
      />
    </div>
  );
}
