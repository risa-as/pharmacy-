/**
 * Id prefix for a local sale reference typed by the user: "م-" + the first 12
 * hex characters of the sale id, as printed before sync (src/components/pos/
 * pos-utils.ts localSaleRef). The prefix and the hyphen are optional when typed.
 * Returns null when the text is not such a reference.
 */
export function saleIdPrefix(query: string): string | null {
  const hex = /^(?:م-|#)?([0-9a-f]{8})-?([0-9a-f]{4})?$/i.exec(query.trim());
  if (!hex) return null;
  return (hex[2] ? `${hex[1]}-${hex[2]}` : hex[1]).toLowerCase();
}
