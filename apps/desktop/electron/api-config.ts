function normalizeApiBase(url: string): string {
    return url.replace(/\/+$/, "");
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values.map(normalizeApiBase)));
}

function computeApiCandidates(): string[] {
    const envCandidates = [
        process.env.FARAMACE_API_BASE_URL,
        process.env.FARAMACE_API_URL,
        process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api` : undefined,
    ].filter(Boolean) as string[];

    const localCandidates = [
        "http://127.0.0.1:3000/api",
        "http://localhost:3000/api",
    ];

    const cloudCandidates = [
        "https://faramace.com/api",
    ];

    const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV !== "production";

    if (isDev) {
        return unique([...localCandidates]);
    }

    return unique([...envCandidates, ...cloudCandidates, ...localCandidates]);
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

