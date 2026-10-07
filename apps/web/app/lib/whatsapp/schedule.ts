import { WaError } from "./shared";

/** datetime-local has no zone; the composer explicitly uses Baghdad (UTC+03). */
export function baghdadSchedule(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new WaError("اختر تاريخ ووقت الإرسال.");
  const date = new Date(`${value}:00+03:00`);
  if (!Number.isFinite(date.getTime()))
    throw new WaError("موعد الإرسال غير صالح.");
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  if (local !== value) throw new WaError("موعد الإرسال غير صالح.");
  return date.toISOString();
}

export function validateSchedule(value: string | null, now = new Date()) {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime())
    throw new WaError("اختر موعد إرسال لاحقًا للوقت الحالي.");
  return date;
}

export function formatSchedule(value: string | Date) {
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(new Date(value));
}
