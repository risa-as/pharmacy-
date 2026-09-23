import { prisma } from './prisma';
import { getUserPermissions } from './permissions';
import { warehouseOrderScope } from './warehouse-access';

/** Old orders without a trustworthy requesting user require manual approval. */
export async function canAutomaticallyApproveWarehouseOrder(orderId: string): Promise<boolean> {
 const event = await prisma.warehouseOrderEvent.findFirst({where:{orderId,type:'SENT',actorType:'PHARMACY'},orderBy:{createdAt:'asc'},select:{payload:true}});
 const payload = event?.payload as {requestedByUserId?:unknown;canAutoApproveQuote?:unknown} | null;
 if (payload?.canAutoApproveQuote !== true || typeof payload.requestedByUserId !== 'string') return false;
 const user = await prisma.user.findUnique({where:{id:payload.requestedByUserId},select:{role:true,isActive:true,permissions:true,branchId:true,branch:{select:{organizationId:true}}}});
 if (!user?.isActive || !getUserPermissions(user).canApproveWarehouseOrder) return false;
 const scope = warehouseOrderScope({role:user.role,branchId:user.branchId ?? undefined,organizationId:user.branch?.organizationId});
 if (!scope) return false;
 return !!await prisma.warehouseOrder.findFirst({where:{AND:[{id:orderId},scope]},select:{id:true}});
}
