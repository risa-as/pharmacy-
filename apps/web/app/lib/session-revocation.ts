/**
 * Revokes every session of a user (web cookie, mobile JWT, desktop sync token)
 * whenever their password changes or their account is disabled, by bumping
 * User.sessionVersion in the same write. Applied as Prisma middleware so every
 * current and future call site is covered (change-password, admin resets,
 * warehouse user management, user edit actions) without per-site code.
 *
 * Disabling bumps the version too, so re-enabling an account does not revive
 * tokens issued before it was disabled.
 */
export function withSessionRevocation(params: { model?: string; action: string; args?: any }) {
    if (params.model !== 'User' || !['update', 'updateMany', 'upsert'].includes(params.action)) return params;
    const revokes = (data: any) => !!data && (data.password !== undefined || data.isActive === false);
    const bump = (data: any) => (revokes(data) && data.sessionVersion === undefined
        ? { ...data, sessionVersion: { increment: 1 } } : data);
    const args = params.args ?? {};
    if (params.action === 'upsert') return { ...params, args: { ...args, update: bump(args.update) } };
    return { ...params, args: { ...args, data: bump(args.data) } };
}
