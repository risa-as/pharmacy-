'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { GitBranch } from 'lucide-react';

interface Branch { id: string; name: string; }

export default function BranchSelector({
    branches,
    selectedBranchId,
}: {
    branches: Branch[];
    selectedBranchId?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    if (branches.length <= 1) return null;

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) {
            params.set('branchId', e.target.value);
        } else {
            params.delete('branchId');
        }
        params.delete('page'); // reset pagination on branch change
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
                value={selectedBranchId || ''}
                onChange={handleChange}
                className="rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
                <option value="">جميع الفروع</option>
                {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </select>
        </div>
    );
}
