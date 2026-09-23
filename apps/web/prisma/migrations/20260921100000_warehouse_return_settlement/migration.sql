ALTER TABLE "Batch" ADD COLUMN "purchaseItemId" TEXT;
ALTER TABLE "WarehouseStockMove" ADD COLUMN "unitCost" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN "warehouseOrderId" TEXT;
CREATE UNIQUE INDEX "Purchase_warehouseOrderId_key" ON "Purchase"("warehouseOrderId");
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "unitsPerPack" INTEGER;
ALTER TABLE "WarehouseReturn" ADD COLUMN "purchaseId" TEXT,
    ADD COLUMN "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "acceptedAt" TIMESTAMP(3);
UPDATE "WarehouseReturn" SET "acceptedAt" = "updatedAt" WHERE status = 'ACCEPTED';
ALTER TABLE "WarehouseReturnItem" ADD COLUMN "pharmacyAllocations" JSONB,
    ADD COLUMN "disposition" TEXT NOT NULL DEFAULT 'QUARANTINE',
    ADD COLUMN "inspectionNote" TEXT,
    ADD COLUMN "inspectedBy" TEXT,
    ADD COLUMN "inspectedAt" TIMESTAMP(3),
    ADD COLUMN "warehouseAllocations" JSONB;
-- Historical records deliberately remain unlinked. Do not infer a stock lot or
-- silently subtract stock for an already processed return during deployment.

-- Link only explicit APPROVED purchase identities, with tenant/branch verification.
WITH links AS (
 SELECT o.id AS order_id, p.id AS purchase_id,
        count(*) OVER (PARTITION BY o.id) AS order_count,
        count(*) OVER (PARTITION BY p.id) AS purchase_count
 FROM "WarehouseOrderEvent" e JOIN "WarehouseOrder" o ON o.id=e."orderId"
 JOIN "Purchase" p ON p.id=e.payload->>'purchaseId' AND p."branchId"=o."branchId"
 JOIN "Branch" b ON b.id=p."branchId"
 JOIN "Supplier" s ON s.id=p."supplierId" AND s."warehouseId"=o."warehouseId" AND s."organizationId"=b."organizationId"
 WHERE e.type='APPROVED'
)
UPDATE "Purchase" p SET "warehouseOrderId"=l.order_id FROM links l
WHERE p.id=l.purchase_id AND l.order_count=1 AND l.purchase_count=1;

-- Recover the immutable conversion from approved paid receipt quantities, never
-- from today's editable pack size. Ambiguous duplicate lines remain unresolved.
WITH units AS (
 SELECT i.id, pi.quantity / NULLIF(CASE WHEN i.status='OUT_OF_STOCK' THEN 0 ELSE COALESCE(i."quotedQuantity",i.quantity) END,0) AS value,
        count(*) OVER (PARTITION BY i.id) AS matches
 FROM "WarehouseOrderItem" i JOIN "Purchase" p ON p."warehouseOrderId"=i."warehouseOrderId"
 JOIN "PurchaseItem" pi ON pi."purchaseId"=p.id AND pi."drugId"=i."drugId" AND pi.cost>0
 WHERE CASE WHEN i.status='OUT_OF_STOCK' THEN 0 ELSE COALESCE(i."quotedQuantity",i.quantity) END > 0
 AND pi.quantity % NULLIF(COALESCE(i."quotedQuantity",i.quantity),0)=0
)
UPDATE "WarehouseOrderItem" i SET "unitsPerPack"=u.value FROM units u WHERE i.id=u.id AND u.matches=1 AND u.value>0;

-- The receipt audit and Batch.createdAt share the PostgreSQL transaction time.
-- Require that exact transaction identity as well as item, supplier and amount;
-- batch number/expiry similarity by itself is deliberately insufficient.
WITH receipts AS (
 SELECT b.id AS batch_id, pi.id AS item_id,
        count(*) OVER (PARTITION BY b.id) AS batch_matches,
        count(*) OVER (PARTITION BY pi.id) AS item_matches
 FROM "Batch" b JOIN "Inventory" inv ON inv.id=b."inventoryId"
 JOIN "AuditLog" a ON a."createdAt"=b."createdAt" AND a.entity='PURCHASE' AND a.action='UPDATE'
 JOIN "Purchase" p ON p.id=a."entityId" AND p."branchId"=inv."branchId" AND p."supplierId"=b."supplierId" AND p.status='COMPLETED'
 JOIN "PurchaseItem" pi ON pi."purchaseId"=p.id AND pi."drugId"=inv."drugId" AND pi.quantity=b."initialQuantity" AND pi.cost=b."costPrice"
 WHERE p."warehouseOrderId" IS NOT NULL AND a.details LIKE '%"event":"received"%'
)
UPDATE "Batch" b SET "purchaseItemId"=r.item_id FROM receipts r WHERE b.id=r.batch_id AND r.batch_matches=1 AND r.item_matches=1;
