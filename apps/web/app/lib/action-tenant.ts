import { NextResponse } from 'next/server';
import { getTenantContext } from './tenant-utils';
import type { UserPermissions } from './permissions';

/** Internal helper, deliberately not a remotely callable Server Action. */
export async function requireActionTenant(permission: keyof UserPermissions, access: 'read' | 'write' = 'write') {
    const ctx = await getTenantContext(access);
    if (ctx instanceof NextResponse) {
        const body = await ctx.json();
        throw new Error(body.error || 'غير مصرح');
    }
    if (!ctx.userPermissions[permission]) throw new Error('ليس لديك صلاحية لهذا الإجراء.');
    return ctx;
}
