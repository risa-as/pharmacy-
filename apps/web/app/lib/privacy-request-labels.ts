export const PRIVACY_STATUSES = ['REQUESTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED'] as const;
export type PrivacyStatus = typeof PRIVACY_STATUSES[number];
export const privacyStatusLabel: Record<PrivacyStatus, string> = {
    REQUESTED: 'بانتظار المراجعة', IN_REVIEW: 'قيد التحقق والمعالجة', COMPLETED: 'أُنجزت المعالجة', REJECTED: 'تعذر التنفيذ؛ راجع الرد',
};
