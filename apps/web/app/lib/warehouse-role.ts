// Edge-safe: keep middleware role checks independent of auth/Prisma/Node APIs.
export function isWarehouseRole(role: string): boolean {
    return role === 'WAREHOUSE';
}
