"use client";

import { useState } from "react";
import { GitBranch, ToggleLeft, ToggleRight } from "lucide-react";

interface Branch {
    id: string;
    name: string;
    loyaltyEnabled: boolean;
}

interface Props {
    initialBranches: Branch[];
    orgLoyaltyEnabled: boolean;
}

export default function BranchLoyaltyToggle({ initialBranches, orgLoyaltyEnabled }: Props) {
    const [branches, setBranches] = useState<Branch[]>(initialBranches);
    const [toggling, setToggling] = useState<string | null>(null);

    const toggle = async (branchId: string, enabled: boolean) => {
        setToggling(branchId);
        try {
            const res = await fetch("/api/loyalty/branches", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ branchId, loyaltyEnabled: enabled }),
            });
            if (!res.ok) throw new Error();
            const updated: Branch = await res.json();
            setBranches((prev) =>
                prev.map((b) => (b.id === branchId ? { ...b, loyaltyEnabled: updated.loyaltyEnabled } : b))
            );
        } catch {
            alert("فشل تحديث إعداد الفرع");
        } finally {
            setToggling(null);
        }
    };

    return (
        <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <GitBranch className="w-4 h-4 text-primary" />
                </div>
                <div>
                    <h2 className="font-bold text-foreground font-cairo leading-tight">تفعيل الولاء حسب الفرع</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        حدّد الفروع المشاركة — يجب تفعيل البرنامج على مستوى المنشأة أولاً.
                    </p>
                </div>
            </div>
            <div className="p-5 space-y-3">
                {branches.map((branch) => (
                    <div
                        key={branch.id}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${branch.loyaltyEnabled ? "bg-success/10 border-success/30" : "bg-muted/40 border-border"}`}
                    >
                        <div>
                            <div className="font-bold text-foreground">{branch.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                {branch.loyaltyEnabled
                                    ? "مفعّل — يكسب الزبائن نقاطاً في هذا الفرع"
                                    : "معطّل — لا تُمنح نقاط في هذا الفرع"}
                            </div>
                        </div>
                        <button
                            onClick={() => toggle(branch.id, !branch.loyaltyEnabled)}
                            disabled={toggling === branch.id || !orgLoyaltyEnabled}
                            title={!orgLoyaltyEnabled ? "فعّل البرنامج على مستوى المنشأة أولاً" : undefined}
                            className="transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {branch.loyaltyEnabled ? (
                                <ToggleRight className="w-12 h-12 text-success" />
                            ) : (
                                <ToggleLeft className="w-12 h-12 text-muted-foreground" />
                            )}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
