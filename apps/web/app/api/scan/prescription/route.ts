export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Fuse from 'fuse.js';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { enforceRateLimit } from '@/app/lib/rate-limit';

// We'll use the REST API approach for Google Vision to avoid complex auth setups
// and just use the simple API key the user provided.
const GOOGLE_VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;

// Cap the inbound image so an attacker can't run up the Vision bill or exhaust
// memory with a huge base64 blob. ~12MB of base64 ≈ a 9MB photo.
const MAX_IMAGE_CHARS = 12 * 1024 * 1024;

export async function POST(req: Request) {
    try {
        // Authenticated users only — this endpoint calls a paid external API.
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const limited = await enforceRateLimit(req, 'scan-prescription', 20, 60_000);
        if (limited) return limited;

        const body = await req.json();
        const base64Image = body.image;

        if (!base64Image || typeof base64Image !== 'string') {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        if (base64Image.length > MAX_IMAGE_CHARS) {
            return NextResponse.json({ error: 'الصورة كبيرة جدًا' }, { status: 413 });
        }

        // 2. Call Google Cloud Vision API
        const visionResponse = await fetch(GOOGLE_VISION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                requests: [
                    {
                        image: { content: base64Image },
                        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], // Better for handwriting
                    },
                ],
            }),
        });

        const visionData = await visionResponse.json();

        if (!visionResponse.ok) {
            console.error('Vision API Error:', visionData);
            const apiError = visionData.error?.message || 'Failed to process image with Vision API';
            return NextResponse.json({ error: apiError }, { status: 500 });
        }

        // 3. Extract text
        const textAnnotations = visionData.responses[0]?.textAnnotations;
        if (!textAnnotations || textAnnotations.length === 0) {
            return NextResponse.json({ rawText: '', suggestions: [] });
        }

        // The first annotation contains the entire raw text
        const rawText = textAnnotations[0].description;

        // Split into lines for analysis
        const words = rawText.split(/\r?\n/).map((w: string) => w.trim()).filter((w: string) => w.length > 2);

        // 4. Fetch all global drugs for fuzzy matching
        // In a huge database, we might need a more optimized DB-level pg_trgm search,
        // but for now, pulling drug names for Fuse.js is okay if the list isn't gigantic.
        // Let's select just id, tradeName, scientificName to keep it light.
        const drugs = await prisma.globalDrug.findMany({
            select: { id: true, tradeName: true, scientificName: true },
            where: { isActive: true }
        });

        // 5. Setup Fuse.js for fuzzy matching
        const fuse = new Fuse(drugs, {
            keys: ['tradeName', 'scientificName'],
            includeScore: true,
            threshold: 0.4, // Adjust for fuzziness (0 is perfect match, 1 is anything)
        });

        // 6. Analyze extracted words and find matches
        const suggestionsMap = new Map();

        for (const word of words) {
            // Ignore common noise words (doctors, addresses, numbers, etc)
            if (/^\d/.test(word) || word.length < 3) continue;

            const results = fuse.search(word);

            // Take top 2 matches for each word if score is good enough
            const topMatches = results.filter((r: any) => r.score && r.score < 0.4).slice(0, 2);

            for (const match of topMatches) {
                const item = match.item as any;
                if (!suggestionsMap.has(item.id)) {
                    suggestionsMap.set(item.id, {
                        ...item,
                        confidence: ((1 - (match.score || 0)) * 100).toFixed(0) + '%',
                        matchedFrom: word
                    });
                }
            }
        }

        const suggestions = Array.from(suggestionsMap.values());

        return NextResponse.json({
            rawText,
            suggestions
        });

    } catch (error) {
        console.error('OCR Processing Error:', error);
        return NextResponse.json({ error: 'Internal server error processing prescription' }, { status: 500 });
    }
}
