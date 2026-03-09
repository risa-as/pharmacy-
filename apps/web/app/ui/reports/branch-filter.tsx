import { prisma } from "@/app/lib/prisma";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

interface BranchFilterProps {
    currentBranch: string | undefined;
    baseUrl: string;
    extraParams?: string;
}

export async function BranchFilter({ currentBranch, baseUrl, extraParams }: BranchFilterProps) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantWhere } = tenantCtx;

    const branches = await prisma.branch.findMany({
        where: tenantWhere,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    if (branches.length <= 1) return null;

    const buildUrl = (branchId?: string) => {
        const params = new URLSearchParams();
        if (branchId) params.set("branch", branchId);
        if (extraParams) {
            const extra = new URLSearchParams(extraParams);
            extra.forEach((v: any, k: any) => {
                if (k !== "branch") params.set(k, v);
            });
        }
        const qs = params.toString();
        return qs ? `${baseUrl}?${qs}` : baseUrl;
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-sm text-muted-foreground font-bold">
                <Building2 className="w-4 h-4" />
                الفرع:
            </span>
            <Link
                href={buildUrl()}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!currentBranch
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-card border border-border text-muted-foreground hover:border-primary/50"
                    }`}
            >
                كل الفروع
            </Link>
            {branches.map((b: any) => (
                <Link
                    key={b.id}
                    href={buildUrl(b.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentBranch === b.id
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-card border border-border text-muted-foreground hover:border-primary/50"
                        }`}
                >
                    {b.name}
                </Link>
            ))}
        </div>
    );
}
