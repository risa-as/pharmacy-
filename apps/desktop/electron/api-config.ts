// These globals are replaced at build time by vite.config.ts define.
// In dev mode they fall back to empty string → localCandidates are used.
declare const __API_URL__: string;
declare const __CLOUD_API_URL__: string;

function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeApiBase)));
}

function computeApiCandidates(): string[] {
  // __API_URL__ is baked in at build time (e.g. "https://app.faramace.com/api")
  // In dev it is "" so we fall through to localCandidates.
  const builtInUrl: string = typeof __API_URL__ !== "undefined" ? __API_URL__ : "";

  if (builtInUrl) {
    return unique([builtInUrl]);
  }

  // Dev fallback
  return unique([
    "http://127.0.0.1:3000/api",
    "http://localhost:3000/api",
  ]);
}

const API_CANDIDATES = computeApiCandidates();
let activeApiBase = API_CANDIDATES[0] || "http://127.0.0.1:3000/api";

export function getApiCandidates(): string[] {
  const rest = API_CANDIDATES.filter((base) => base !== activeApiBase);
  return [activeApiBase, ...rest];
}

export function getApiBaseUrl(): string {
  return activeApiBase;
}

export function setApiBaseUrl(base: string): void {
  activeApiBase = normalizeApiBase(base);
}

export function buildApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${activeApiBase}${normalizedPath}`;
}
