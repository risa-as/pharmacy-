export function formatIQD(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount) + " د.ع";
}

export function generateInvoiceNumber(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export function ipcInvoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    return Promise.race([
        window.ipcRenderer.invoke(channel, ...args) as Promise<T>,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`IPC timeout (${channel})`)), 12000)
        ),
    ]);
}

export function getExpiryStatus(
    expiryDate: string | null | undefined
): { label: string; color: string; urgent: boolean } | null {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { label: 'منتهي', color: 'bg-destructive text-destructive-foreground', urgent: true };
    if (diffDays <= 90) return { label: `${diffDays} يوم`, color: 'bg-destructive/10 text-destructive', urgent: true };
    if (diffDays <= 180) return { label: `${Math.ceil(diffDays / 30)} شهر`, color: 'bg-warning/10 text-warning', urgent: false };
    return null;
}
