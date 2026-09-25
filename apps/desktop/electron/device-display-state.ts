/** Display-only state; never use cached enrollment or token contents to authorize a request. */
export function deviceDisplayState(config: {fingerprint?: string; keyId?: string; status?: string} | undefined, token: unknown, currentUser: unknown, syncUser: unknown, error: unknown) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  const sessionReady = !!config?.keyId && !!currentUser && currentUser === syncUser &&
    parts.length === 4 && parts[0] === 'd1' && parts[1] === config.keyId &&
    parts[2] === config.fingerprint && /^[a-f0-9]{64}$/.test(parts[3]);
  const known = ['ACTIVE', 'PENDING', 'REVOKED'].includes(config?.status || '') ? config!.status : null;
  return {status: error ? null : known === 'REVOKED' ? known : sessionReady ? 'ACTIVE' : known,
    sessionReady: !error && known !== 'REVOKED' && sessionReady};
}
