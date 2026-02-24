'use client';

import { Button } from '@/components/ui/button';

export default function PurchasePrintButton() {
    return (
        <Button variant="outline" onClick={() => window.print()}>
            طباعة
        </Button>
    );
}
