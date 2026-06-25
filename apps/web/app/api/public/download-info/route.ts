import { NextResponse } from "next/server";
import { getDownloadSettings } from "@/app/lib/actions/download-settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/download-info
 *
 * Public (unauthenticated) endpoint that returns the download links/version/size
 * configured by the SUPER_ADMIN. Consumed by the separate landing site
 * (www.faramace.com/download), which has no database access of its own.
 *
 * CORS is wide-open because the payload is non-sensitive marketing data and the
 * landing app fetches it server-side anyway.
 */
export async function GET() {
    const settings = await getDownloadSettings();
    return NextResponse.json(settings, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            // Let CDNs/clients cache briefly; the landing app uses ISR on top of this.
            "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
    });
}
