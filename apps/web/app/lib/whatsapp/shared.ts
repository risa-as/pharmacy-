/** Shared browser/server values; keep encryption and provider credentials out. */
export class WaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function normalizePhone(input: string): string | null {
  const ascii = input
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776));
  let p = ascii.replace(/[\s()+-]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (/^07\d{9}$/.test(p)) p = "964" + p.slice(1);
  if (/^7\d{9}$/.test(p)) p = "964" + p;
  return /^[1-9]\d{7,14}$/.test(p) ? p : null;
}
