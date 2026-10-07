// Built with the constructor: the "u" flag literal is rejected by the es5 tsconfig target.
const HAS_LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

/**
 * Imported catalogue rows use "." or "0" as a placeholder for a missing value (scientific name,
 * origin, barcode). Returns null for those, so tables show «—» instead of a stray dot.
 */
export function displayText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text === "0" || !HAS_LETTER_OR_DIGIT.test(text)) return null;
  return text;
}
