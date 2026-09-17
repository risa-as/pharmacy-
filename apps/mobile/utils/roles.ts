/**
 * Maps a user role to the app shell (tab bar + home) it should see.
 *
 * PHARMACIST and CASHIER sell at the counter → pharmacist shell.
 * ADMIN / MANAGER / WAREHOUSE → manager shell.
 * The server still enforces every permission; this only picks the UI.
 */
export type AppShell = 'manager' | 'pharmacist';

const PHARMACIST_SHELL_ROLES = new Set(['PHARMACIST', 'CASHIER']);

export function getShell(role: string | null | undefined): AppShell {
    return PHARMACIST_SHELL_ROLES.has((role ?? '').toUpperCase()) ? 'pharmacist' : 'manager';
}

/** Roles allowed to switch between branches (others are scoped to their session branch). */
export function canSwitchBranch(role: string | null | undefined): boolean {
    const r = (role ?? '').toUpperCase();
    return r === 'ADMIN' || r === 'MANAGER';
}

/** Arabic display label for a role. */
export const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'مدير',
    MANAGER: 'مشرف',
    PHARMACIST: 'صيدلاني',
    CASHIER: 'كاشير',
    WAREHOUSE: 'مسؤول مستودع',
    SUPER_ADMIN: 'مدير النظام',
};

export function roleLabel(role: string | null | undefined): string {
    return ROLE_LABELS[(role ?? '').toUpperCase()] ?? role ?? '';
}
