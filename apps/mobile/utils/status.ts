/**
 * Status → label + tone, one mapping per domain (navigation-map §12):
 * orange = pending / low / near expiry, red = expired / critical / cancelled,
 * green = healthy / completed.
 */
export type StatusTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export function purchaseStatus(status: string): { label: string; tone: StatusTone } {
    switch (status) {
        case 'PENDING': return { label: 'قيد الانتظار', tone: 'warning' };
        case 'RECEIVED': return { label: 'تم الاستلام', tone: 'success' };
        case 'COMPLETED': return { label: 'مكتمل', tone: 'success' };
        case 'CANCELLED': return { label: 'ملغى', tone: 'danger' };
        default: return { label: status, tone: 'neutral' };
    }
}
