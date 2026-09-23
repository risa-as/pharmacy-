import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

export class WarehouseOperationError extends Error {
    constructor(message: string, public readonly status = 409) { super(message); }
}

function canonical(value: any): any {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(
        Object.keys(value).sort().filter(key => key !== 'idempotencyKey').map(key => [key, canonical(value[key])])
    );
    return value;
}

export function warehouseCommand(warehouseId: string, scope: string, body: any) {
    const key = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
        throw new WarehouseOperationError('مفتاح العملية مفقود أو غير صالح. حدّث الصفحة وأعد المحاولة.', 400);
    }
    return { warehouseId, key, scope, requestHash: createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex') };
}

type Command = ReturnType<typeof warehouseCommand>;
export async function warehouseReplay(db: Pick<PrismaClient, 'warehouseOperation'> | Prisma.TransactionClient, command: Command) {
    const previous = await db.warehouseOperation.findUnique({ where: { warehouseId_key: { warehouseId: command.warehouseId, key: command.key } } });
    if (!previous) return null;
    if (previous.scope !== command.scope || previous.requestHash !== command.requestHash) {
        throw new WarehouseOperationError('مفتاح العملية مستخدم لطلب مختلف.');
    }
    return previous.result as Record<string, any>;
}

export async function runWarehouseOperation<T>(tx: Prisma.TransactionClient, command: Command, work: () => Promise<T>): Promise<T> {
    const lockKey = `warehouse-operation:${command.warehouseId}:${command.key}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
    const previous = await warehouseReplay(tx, command);
    if (previous) return previous as T;
    const result = await work();
    await tx.warehouseOperation.create({ data: { ...command, result: JSON.parse(JSON.stringify(result)) } });
    return result;
}
