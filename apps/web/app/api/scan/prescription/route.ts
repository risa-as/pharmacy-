export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { enforceRateLimit } from '@/app/lib/rate-limit';

// ── الإعدادات ────────────────────────────────────────────────────────────────
const SCAN_PROVIDER = (process.env.PRESCRIPTION_SCAN_PROVIDER || 'gemini').toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const GOOGLE_VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;

const MAX_IMAGE_CHARS = 12 * 1024 * 1024;

// ── كلمات عامة ليست أسماء أدوية (للنظام vision) ──────────────────────────────
const NOISE_WORDS = new Set([
    'total', 'spray', 'cream', 'oint', 'gel', 'tab', 'cap', 'amp', 'vial',
    'lotion', 'shampoo', 'syrup', 'drops', 'mixed',
    'ekg', 'ecg', 'age', 'sex', 'dob', 'name', 'date', 'phone', 'dr',
    'acc', 'bdo', 'ont', 'lea', 'body', 'face', 'plus', 'active', 'forte',
    'extra', 'care', 'water', 'spirits',
    'mg', 'ml', 'gm', 'mcg', 'iu', 'kg', 'cc',
]);

// ══════════════════════════════════════════════════════════════════════════════
// أدوات مشتركة
// ══════════════════════════════════════════════════════════════════════════════

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

type DrugInfo = { id: string; tradeName: string; scientificName: string };

// كلمات الجرعة/الشكل الدوائي لحذفها قبل المطابقة
const DOSAGE_NOISE_RE = /\b(\d+\s*(?:mg|ml|gm|g|mcg|iu|%)|(?:tab|cap|amp|vial|oint|cream|gel|spray)\b|\d+)\b/gi;

function extractDrugBaseName(raw: string): string {
    return raw.replace(DOSAGE_NOISE_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function matchDrugsToInventory(extractedNames: string[], drugs: DrugInfo[]) {
    const suggestions: {
        id: string; tradeName: string; scientificName: string;
        confidence: string; matchedFrom: string; inStock: boolean;
    }[] = [];
    const matchedIds = new Set<string>();

    for (const extracted of extractedNames) {
        const baseName      = extractDrugBaseName(extracted);
        const baseNameLower = baseName.toLowerCase().trim();
        const fullLower     = extracted.toLowerCase().trim();

        if (!baseNameLower || baseNameLower.length < 3) continue;

        // الكلمة الأولى من الاسم المستخرج (بعد حذف الجرعات)
        const extractedWords = baseNameLower.split(/\s+/);
        const extractedFirst = extractedWords[0];
        // أول كلمتين للمطابقة المركّبة (مثل "aloe vera")
        const extractedTwoWords = extractedWords.slice(0, 2).join(' ');

        let bestMatch: DrugInfo | null = null;
        let bestScore = Infinity;
        let bestConfidence = '';

        for (const drug of drugs) {
            if (matchedIds.has(drug.id)) continue;
            const tradeLower = drug.tradeName.toLowerCase().replace(/[-_]/g, ' ').trim();
            const sciLower   = (drug.scientificName || '').toLowerCase().replace(/[-_]/g, ' ').trim();
            const tradeFirst = tradeLower.split(/\s+/)[0];
            const sciFirst   = sciLower.split(/\s+/)[0];

            let currentScore = Infinity;
            let currentConfidence = '';

            // ── 1. تطابق تام للاسم كاملاً (حد أدنى 5 أحرف) ──
            const MIN_SUBSTR = 5;
            if (tradeLower.length >= MIN_SUBSTR) {
                if (tradeLower === baseNameLower || tradeLower === fullLower) {
                    currentScore = -2; currentConfidence = '100%';
                } else if (baseNameLower.includes(tradeLower) || fullLower.includes(tradeLower)) {
                    currentScore = -2; currentConfidence = '100%';
                } else if (baseNameLower.length >= MIN_SUBSTR && tradeLower.includes(baseNameLower)) {
                    currentScore = -2; currentConfidence = '100%';
                }
            }

            // ── 2. تطابق تام للاسم العلمي (حد أدنى 5 أحرف) ──────────────────────
            if (currentScore > -1 && sciLower.length >= MIN_SUBSTR) {
                if (sciLower === baseNameLower || sciLower === fullLower) {
                    currentScore = -1; currentConfidence = '98%';
                } else if ((baseNameLower.includes(sciLower) || sciLower.includes(baseNameLower)) && baseNameLower.length >= MIN_SUBSTR) {
                    currentScore = -1; currentConfidence = '98%';
                }
            }

            // ── 3. تطابق أول كلمتين كـ substring (≥ 7 أحرف مجموعة) ──────────────
            if (currentScore > 0 && extractedWords.length >= 2 && extractedTwoWords.length >= 7) {
                if (tradeLower.startsWith(extractedTwoWords) || tradeLower.includes(` ${extractedTwoWords}`) || tradeLower.includes(extractedTwoWords)) {
                    if (tradeLower.includes(extractedFirst)) {
                        currentScore = 0.1; currentConfidence = '90%';
                    }
                } else if (sciLower.includes(extractedTwoWords)) {
                    currentScore = 0.2; currentConfidence = '88%';
                }
            }

            // ── 4. تطابق تام لأول كلمة (حد أدنى 4 أحرف) ────────────────────────
            if (currentScore > 0.5 && extractedFirst.length >= 4) {
                if (tradeFirst === extractedFirst) {
                    currentScore = 0.3; currentConfidence = '95%';
                } else if (sciFirst && sciFirst === extractedFirst) {
                    currentScore = 0.4; currentConfidence = '92%';
                }
            }

            // ── 5. تطابق ضبابي صارم (أول كلمة ≥ 7 أحرف، مسافة ≤ 2 فقط) ─────────
            const MIN_FUZZY_LEN = 7;
            const MAX_EDIT_DIST = 2;

            if (currentScore > 1 && extractedFirst.length >= MIN_FUZZY_LEN) {
                if (tradeFirst.length >= MIN_FUZZY_LEN) {
                    const dist = levenshtein(extractedFirst, tradeFirst);
                    if (dist <= MAX_EDIT_DIST && dist < currentScore) {
                        currentScore = dist;
                        currentConfidence = ((1 - dist / Math.max(extractedFirst.length, tradeFirst.length)) * 100).toFixed(0) + '%';
                    }
                }
                if (sciFirst.length >= MIN_FUZZY_LEN) {
                    const dist = levenshtein(extractedFirst, sciFirst);
                    if (dist <= MAX_EDIT_DIST && (dist + 0.5) < currentScore) { // +0.5 to prefer trade fuzzy over sci fuzzy
                        currentScore = dist + 0.5;
                        currentConfidence = ((1 - dist / Math.max(extractedFirst.length, sciFirst.length)) * 100).toFixed(0) + '%';
                    }
                }
            }

            if (currentScore < bestScore) {
                bestMatch = drug;
                bestScore = currentScore;
                bestConfidence = currentConfidence;
            }

            // التوقف الفوري فقط إذا وجدنا تطابقاً تجارياً مثالياً
            if (bestScore === -2) break;
        }

        if (bestMatch && bestScore < Infinity) {
            matchedIds.add(bestMatch.id);
            suggestions.push({
                id: bestMatch.id, tradeName: bestMatch.tradeName,
                scientificName: bestMatch.scientificName,
                confidence: bestConfidence, matchedFrom: extracted,
                inStock: true,
            });
        } else {
            const displayName = baseName.length >= 3 ? baseName : extracted;
            if (displayName.length >= 3) {
                suggestions.push({
                    id: `not-in-stock-${displayName.replace(/\s+/g, '-').substring(0, 30)}`,
                    tradeName: displayName,
                    scientificName: '',
                    confidence: '—',
                    matchedFrom: extracted,
                    inStock: false,
                });
            }
        }
    }
    return suggestions;
}

// ══════════════════════════════════════════════════════════════════════════════
// نظام 1: Gemini AI Vision
// ══════════════════════════════════════════════════════════════════════════════

async function extractWithGemini(base64Image: string): Promise<{ rawText: string; extractedDrugs: string[] }> {
    console.log('[SCAN] Model:', GEMINI_MODEL, '| Image chars:', base64Image.length);

    // ── تحديد نوع الصورة ──────────────────────────────────────────────────────
    // base64 images from ImageManipulator are always JPEG; from ImagePicker may be PNG
    // Detect by first bytes: PNG starts with iVBOR, JPEG starts with /9j/
    const mimeType = base64Image.startsWith('/9j/') ? 'image/jpeg'
        : base64Image.startsWith('iVBOR') ? 'image/png'
        : 'image/jpeg'; // default to JPEG

    const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    {
                        // OCR-focused prompt — avoids safety filter triggers
                        text: `This is a pharmacy inventory task. Look at this medical document image and extract all text items that appear to be pharmaceutical product names (medications/drugs).

List each pharmaceutical name you see, one per line. Include the dosage strength if written next to the name (e.g., "500mg", "10mg").

Output format: Return a JSON array of strings only. Example:
["Ciprofloxacin 500mg", "Prednisolone 5mg", "Azithromycin 250mg"]

Only output the JSON array, nothing else.`,
                    },
                    {
                        inlineData: { mimeType, data: base64Image },
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
                // Disable thinking for faster response and less filtering
                thinkingConfig: { thinkingBudget: 0 },
            },
        }),
    });

    const data = await response.json();

    // ── التحقق من الاستجابة ────────────────────────────────────────────────────
    if (!response.ok) {
        console.error('[SCAN] Gemini HTTP error:', response.status, JSON.stringify(data).substring(0, 300));
        throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
    }

    const candidate  = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    console.log('[SCAN] finishReason:', finishReason);

    // Handle blocked or empty response
    if (!candidate || finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        console.warn('[SCAN] Gemini blocked response. Safety ratings:', JSON.stringify(candidate?.safetyRatings));
        // Return empty — the UI will show "لم يتم التعرف على أدوية"
        return { rawText: 'لم يتمكن النظام من تحليل هذه الصورة. يرجى التأكد من وضوح الوصفة والإضاءة الجيدة.', extractedDrugs: [] };
    }

    if (finishReason === 'MAX_TOKENS') {
        console.warn('[SCAN] Gemini hit token limit — response may be truncated');
    }

    const rawGeminiText = candidate?.content?.parts?.[0]?.text || '';
    console.log('[SCAN] Raw response (first 400 chars):', rawGeminiText.substring(0, 400));

    let extractedDrugs: string[] = [];

    // ── محاولة 1: JSON مباشر ──────────────────────────────────────────────────
    try {
        // Strip markdown code fences if present (```json ... ```)
        const cleaned = rawGeminiText
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```\s*$/, '')
            .trim();

        if (cleaned.startsWith('[')) {
            extractedDrugs = JSON.parse(cleaned);
            console.log('[SCAN] ✓ Parsed JSON directly:', extractedDrugs);
        } else {
            // Try to find array anywhere in response
            const m = cleaned.match(/\[[\s\S]*\]/);
            if (m) {
                extractedDrugs = JSON.parse(m[0]);
                console.log('[SCAN] ✓ Parsed JSON via regex:', extractedDrugs);
            }
        }
    } catch (e) {
        console.warn('[SCAN] JSON parse failed:', String(e).substring(0, 100));
    }

    // ── محاولة 2: استخراج سطر بسطر ───────────────────────────────────────────
    if (extractedDrugs.length === 0 && rawGeminiText.length > 3) {
        extractedDrugs = rawGeminiText
            .split('\n')
            .map((l: string) =>
                l.replace(/^[\d.\-*•"'\[\],]+\s*/, '')
                 .replace(/[",\[\]]+/g, '')
                 .trim()
            )
            .filter((l: string) => l.length >= 3 && /[a-zA-Z]/.test(l));
        console.log('[SCAN] ✓ Parsed via line-split fallback:', extractedDrugs);
    }

    console.log('[SCAN] Total drugs extracted:', extractedDrugs.length);

    const rawText = extractedDrugs.length > 0
        ? extractedDrugs.map((d, i) => `${i + 1}. ${d}`).join('\n')
        : 'لم يتم التعرف على أدوية في الوصفة';

    return { rawText, extractedDrugs };
}

// ══════════════════════════════════════════════════════════════════════════════
// نظام 2: Google Cloud Vision OCR + بحث عكسي
// ══════════════════════════════════════════════════════════════════════════════

async function extractWithVision(base64Image: string, drugs: DrugInfo[]): Promise<{ rawText: string; extractedDrugs: string[] }> {
    const response = await fetch(GOOGLE_VISION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                image: { content: base64Image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            }],
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        console.error('Vision API Error:', data);
        throw new Error(data.error?.message || 'فشل تحليل الصورة بواسطة Vision');
    }

    const textAnnotations = data.responses[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
        return { rawText: '', extractedDrugs: [] };
    }

    const rawText: string = textAnnotations[0].description;
    const normalized = rawText.toLowerCase().replace(/[-_]/g, ' ');
    const ocrWords = normalized.split(/[\s\r\n,.;:()\[\]\/\\]+/).filter((w: string) => w.length >= 3);
    const extractedDrugs: string[] = [];

    for (const drug of drugs) {
        const tradeLower = drug.tradeName.toLowerCase().replace(/[-_]/g, ' ').trim();
        const sciLower   = (drug.scientificName || '').toLowerCase().replace(/[-_]/g, ' ').trim();

        if (tradeLower.length >= 3 && normalized.includes(tradeLower)) { extractedDrugs.push(drug.tradeName); continue; }
        if (sciLower.length >= 4 && normalized.includes(sciLower))    { extractedDrugs.push(drug.tradeName); continue; }

        const tradeFirst = tradeLower.split(/\s+/)[0];
        const sciFirst   = sciLower.split(/\s+/)[0];

        if (tradeFirst.length >= 4 && !NOISE_WORDS.has(tradeFirst) && ocrWords.includes(tradeFirst)) { extractedDrugs.push(drug.tradeName); continue; }
        if (sciFirst && sciFirst.length >= 4 && !NOISE_WORDS.has(sciFirst) && ocrWords.includes(sciFirst)) { extractedDrugs.push(drug.tradeName); continue; }

        for (const cand of [tradeFirst, sciFirst].filter(Boolean)) {
            if (cand.length < 5 || NOISE_WORDS.has(cand)) continue;
            for (const ocrWord of ocrWords) {
                if (ocrWord.length < 4 || Math.abs(ocrWord.length - cand.length) > 3) continue;
                const dist = levenshtein(cand, ocrWord);
                if (dist <= 2 && dist / Math.max(cand.length, ocrWord.length) < 0.25) {
                    extractedDrugs.push(drug.tradeName); break;
                }
            }
        }
    }

    return { rawText, extractedDrugs };
}

// ══════════════════════════════════════════════════════════════════════════════
// نقطة الدخول
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const limited = await enforceRateLimit(req, 'scan-prescription', 20, 60_000);
        if (limited) return limited;

        const body         = await req.json();
        const base64Image  = body.image;

        if (!base64Image || typeof base64Image !== 'string') {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }
        if (base64Image.length > MAX_IMAGE_CHARS) {
            return NextResponse.json({ error: 'الصورة كبيرة جدًا' }, { status: 413 });
        }

        console.log('[SCAN] Provider:', SCAN_PROVIDER, '| Image chars:', base64Image.length);

        // ── جلب المخزون ──────────────────────────────────────────────────────
        const inventoryItems = await prisma.inventory.findMany({
            where: {
                ...tenantCtx.tenantBranchWhere,
                drug: { isActive: true },
                batches: { some: { quantity: { gt: 0 } } },
            },
            select: {
                drug: { select: { id: true, tradeName: true, scientificName: true } },
            },
        });

        const seenIds = new Set<string>();
        const drugs = inventoryItems
            .map(item => item.drug)
            .filter((d): d is NonNullable<typeof d> => {
                if (!d || seenIds.has(d.id)) return false;
                seenIds.add(d.id);
                return true;
            });

        console.log('[SCAN] Drugs in inventory:', drugs.length);

        // ── اختيار النظام ────────────────────────────────────────────────────
        let rawText: string;
        let suggestions;

        if (SCAN_PROVIDER === 'vision') {
            const result = await extractWithVision(base64Image, drugs);
            rawText      = result.rawText;
            suggestions  = result.extractedDrugs.map(name => {
                const drug = drugs.find(d => d.tradeName === name);
                return drug ? { id: drug.id, tradeName: drug.tradeName, scientificName: drug.scientificName, confidence: '85%', matchedFrom: name, inStock: true } : null;
            }).filter(Boolean);
        } else {
            const result = await extractWithGemini(base64Image);
            rawText      = result.rawText;
            console.log('[SCAN] Gemini extracted:', result.extractedDrugs);
            suggestions  = matchDrugsToInventory(result.extractedDrugs, drugs);
            console.log('[SCAN] Suggestions: inStock=%d, notInStock=%d',
                suggestions.filter(s => s.inStock).length,
                suggestions.filter(s => !s.inStock).length);
        }

        return NextResponse.json({ rawText, suggestions });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Prescription Scan Error:', msg);
        return NextResponse.json(
            { error: `حدث خطأ أثناء تحليل الوصفة: ${msg}` },
            { status: 500 },
        );
    }
}
