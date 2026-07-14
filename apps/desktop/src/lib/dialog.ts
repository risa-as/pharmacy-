import type { ReactNode } from "react";

/**
 * Global styled replacement for window.alert()/window.confirm().
 *
 * Native dialogs freeze Chromium keyboard input on Windows and look foreign to
 * the app, so every page calls showAlert/showConfirm instead. DialogHost
 * (mounted once in main.tsx) subscribes here and renders AppAlertModal.
 */

export type DialogVariant = "success" | "warning" | "error";

export interface DialogOptions {
    variant?: DialogVariant;
    title: string;
    message?: string;
    /** Overrides the default variant icon. */
    icon?: ReactNode;
    /** Primary action label — required for confirms, unused for alerts. */
    actionLabel?: string;
    /** Auto-dismiss after this many ms (success notices). */
    autoCloseMs?: number;
}

export interface DialogRequest extends DialogOptions {
    id: number;
    kind: "alert" | "confirm";
    resolve: (confirmed: boolean) => void;
}

type Listener = (queue: DialogRequest[]) => void;

let queue: DialogRequest[] = [];
let listener: Listener | null = null;
let nextId = 1;

export function subscribeDialogs(l: Listener): () => void {
    listener = l;
    l(queue);
    return () => { if (listener === l) listener = null; };
}

export function dismissDialog(id: number, confirmed: boolean): void {
    const req = queue.find((r) => r.id === id);
    queue = queue.filter((r) => r.id !== id);
    listener?.(queue);
    req?.resolve(confirmed);
}

function push(req: DialogRequest): void {
    queue = [...queue, req];
    listener?.(queue);
}

/** Styled alert. Resolves when dismissed — awaiting is optional. */
export function showAlert(opts: DialogOptions): Promise<void> {
    return new Promise((resolve) => {
        push({ variant: "warning", ...opts, id: nextId++, kind: "alert", resolve: () => resolve() });
    });
}

/** Styled confirm. Resolves true when the action button is pressed. */
export function showConfirm(opts: DialogOptions & { actionLabel: string }): Promise<boolean> {
    return new Promise((resolve) => {
        push({ variant: "warning", ...opts, id: nextId++, kind: "confirm", resolve });
    });
}
