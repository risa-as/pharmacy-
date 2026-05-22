'use client';

import { useRouter, usePathname } from 'next/navigation';

export default function UsersFilter({
    branches,
    selectedBranchId,
}: {
    branches: { id: string; name: string }[];
    selectedBranchId: string;
}) {
    const router = useRouter();
    const pathname = usePathname();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        const params = new URLSearchParams();
        if (value) params.set('branchId', value);
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-3 mb-5">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">فلترة بالفرع:</label>
            <select
                value={selectedBranchId}
                onChange={handleChange}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            >
                <option value="">جميع الفروع</option>
                {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </select>
        </div>
    );
}
