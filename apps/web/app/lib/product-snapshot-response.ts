import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

// Called only after authentication, authorization and snapshot construction.
// A content revision includes removals and quantity edits as well as additions;
// it does not depend on every stock mutation maintaining a timestamp.
export function productSnapshotResponse(req: Request, snapshot: {
    drugs: unknown[];
    meta: { branchId: string; inventoryIds: string[]; drugIds: string[] };
}) {
    const revision = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    // snapshotAt changes on 200 responses, so the validator is deliberately weak.
    const etag = `W/"${revision}"`;
    const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
    const matches = req.headers.get('if-none-match')?.split(',').some(value => {
        const candidate = value.trim();
        return candidate === '*' || candidate.replace(/^W\//, '') === etag.slice(2);
    });
    if (matches) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ ...snapshot, meta: { ...snapshot.meta, snapshotAt: new Date().toISOString() } }, { headers });
}
