import type { PlanningOptions } from '@/app/lib/smart-purchasing';

/** Client-safe pieces of the saved purchasing settings (OPEN-14). */

/** Built-in defaults when neither the branch nor the organization saved settings. */
export const DEFAULT_PLANNING_OPTIONS: PlanningOptions = { coverageDays: 15, leadDays: 0, safetyDays: 0, fromArrival: false };

/** Days a transfer between branches takes (waste card transfer proposals); not a purchasing option. */
export const DEFAULT_TRANSFER_DAYS = 1;
export const MAX_TRANSFER_DAYS = 7;
export const validTransferDays = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_TRANSFER_DAYS;

/** Where the settings came from; CUSTOM = changed on the page for this session only. */
export type SettingsSource = 'BRANCH' | 'ORGANIZATION' | 'DEFAULT' | 'CUSTOM';

export const SETTINGS_SOURCE_LABEL: Record<SettingsSource, string> = {
    BRANCH: 'إعداد الفرع المحفوظ',
    ORGANIZATION: 'إعداد المؤسسة المحفوظ',
    DEFAULT: 'الإعداد الافتراضي',
    CUSTOM: 'قيم معدّلة لهذه الجلسة فقط',
};

export const sameOptions = (a: PlanningOptions, b: PlanningOptions) =>
    a.coverageDays === b.coverageDays && a.leadDays === b.leadDays && a.safetyDays === b.safetyDays && a.fromArrival === b.fromArrival;

export const describeOptions = (o: PlanningOptions) =>
    `تغطية ${o.coverageDays} يوماً${o.fromArrival ? ' من الوصول' : ''}، مدة توريد ${o.leadDays}، أيام أمان ${o.safetyDays}`;
