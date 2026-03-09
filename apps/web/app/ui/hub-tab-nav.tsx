"use client";

/**
 * HubTabNav — Shared sticky glassmorphism tab bar for all hub pages.
 *
 * Used by: Inventory, Sales, Patients, Reports, Users layout.tsx files.
 * Each layout defines its own tabs + optional action buttons and passes
 * them in as props. The component handles active-state detection
 * automatically via usePathname().
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect } from "react";
import { cn } from "@faramace/ui";

export interface HubTab {
    name: string;
    href: string;
    icon: React.ReactNode;
}

export interface HubAction {
    name: string;
    href: string;
    icon: React.ReactNode;
    /** "primary" renders a filled button; "outline" renders a ghost button. */
    variant?: "primary" | "outline";
}

interface HubTabNavProps {
    tabs: HubTab[];
    actions?: HubAction[];
    /**
     * Pathname substrings that suppress the nav entirely.
     * Useful for hiding the hub bar on deep create/edit forms
     * where navigation context would be distracting.
     * e.g.  skipOnPatterns={["/create", "/edit"]}
     */
    skipOnPatterns?: string[];
}

export default function HubTabNav({ tabs, actions, skipOnPatterns }: HubTabNavProps) {
    const pathname = usePathname() ?? '';
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Suppress on deep sub-routes (create / edit forms).
    // pathname is consistent between SSR and client for structural decisions.
    if (skipOnPatterns?.some((p: any) => pathname.includes(p))) {
        return null;
    }

    return (
        <div className="sticky top-0 z-20 mb-6 rounded-xl border border-border/60 bg-background/80 shadow-sm backdrop-blur-md overflow-hidden">
            {/* ── Action buttons row (optional) ─────────────────────────── */}
            {actions && actions.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2 px-4 pt-3 pb-1 border-b border-border/40">
                    {actions.map((action: any) => (
                        <Link
                            key={action.href}
                            href={action.href}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                action.variant === "primary"
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                    : "border border-border/60 bg-card text-foreground hover:bg-muted",
                            )}
                        >
                            {action.icon}
                            {action.name}
                        </Link>
                    ))}
                </div>
            )}

            {/* ── Tab strip ─────────────────────────────────────────────── */}
            <nav
                className="flex gap-0.5 overflow-x-auto px-2 pt-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                dir="rtl"
            >
                {tabs.map((tab: any) => {
                    /**
                     * Root-tab detection:
                     * If another tab's href starts with `tab.href + "/"`, this tab
                     * is a "root" tab (e.g. /dashboard/inventory) and should only
                     * highlight on an exact pathname match — not on every sub-page.
                     */
                    const isRootTab = tabs.some(
                        (other: any) =>
                            other.href !== tab.href &&
                            other.href.startsWith(tab.href + "/"),
                    );

                    // Defer isActive until after client mount to prevent
                    // SSR pathname → className hydration mismatch.
                    const isActive = mounted && (
                        isRootTab
                            ? pathname === tab.href
                            : pathname === tab.href || pathname.startsWith(tab.href + "/")
                    );

                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold rounded-t-lg whitespace-nowrap transition-all duration-150 border-b-2 -mb-px",
                                isActive
                                    ? "bg-primary/10 text-primary border-primary"
                                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/60",
                            )}
                        >
                            {tab.icon}
                            {tab.name}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
