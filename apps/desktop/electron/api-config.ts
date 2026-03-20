function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeApiBase)));
}

function computeApiCandidates(): string[] {
  const envCandidates = [
    process.env.VITE_API_URL,
    process.env.VITE_CLOUD_API_URL,
  ].filter(Boolean) as string[];

  const localCandidates = [
    "http://127.0.0.1:3000/api",
    "http://localhost:3000/api",
  ];

  // If a URL is explicitly configured via env var, always use it (even in dev)
  if (envCandidates.length > 0) {
    return unique([...envCandidates]);
  }

  const isDev =
    !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV !== "production";

  if (isDev) {
    return unique([...localCandidates]);
  }

  return unique([...localCandidates]);
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
