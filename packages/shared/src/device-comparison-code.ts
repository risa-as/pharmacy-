/** Human comparison only. Authentication must always use the full public key.
 * Version 1: SHA-256 of a domain-separated, normalized SHA-256 fingerprint;
 * first 60 bits encoded as 12 Crockford Base32 characters (no I/L/O/U).
 */
export async function deviceComparisonCode(fingerprint: string): Promise<string> {
  const normalized = fingerprint.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('Invalid device fingerprint');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`faramace-device-comparison:v1:${normalized}`)));
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  for (let group = 0; group < 12; group++) {
    let value = 0;
    for (let bit = 0; bit < 5; bit++) {
      const offset = group * 5 + bit;
      value = (value << 1) | ((digest[Math.floor(offset / 8)] >> (7 - offset % 8)) & 1);
    }
    result += alphabet[value];
  }
  return result.match(/.{4}/g)!.join('-');
}
