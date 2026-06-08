export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { enforceRateLimit } from '@/app/lib/rate-limit';

// ── الإعدادات ────────────────────────────────────────────────────────────────
// PRESCRIPTION_SCAN_PROVIDER في ملف .env:
//   "gemini"  → Gemini AI Vision (أدق للخط اليدوي)
//   "vision"  → Google Cloud Vision OCR (أسرع للنصوص المطبوعة)
const SCAN_PROVIDER = (process.env.PRESCRIPTION_SCAN_PROVIDER || 'gemini').toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
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
const DOSAGE_NOISE_RE = /\b(\d+\s*(?:mg|ml|gm|g|mcg|iu|%)|\d+\s*(?:tab|cap|amp|vial|x\d+))s?\b/gi;

/** استخراج اسم الدواء الأساسي بحذف الجرعات والأشكال الدوائية */
function extractDrugBaseName(raw: string): string {
    return raw
        .replace(DOSAGE_NOISE_RE, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * مطابقة أسماء الأدوية المستخرجة مع مخزون الصيدلية.
 * تُستخدم مع كلا النظامين.
 * تُرجع المتوفرة وغير المتوفرة معاً.
 */
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

        let bestMatch: DrugInfo | null = null;
        let bestScore = Infinity;
        let bestConfidence = '';

        for (const drug of drugs) {
            if (matchedIds.has(drug.id)) continue;
            const tradeLower = drug.tradeName.toLowerCase().replace(/[-_]/g, ' ').trim();
            const sciLower   = (drug.scientificName || '').toLowerCase().replace(/[-_]/g, ' ').trim();

            // جرّب المطابقة مع الاسم المنظّف والاسم الكامل
            for (const name of [baseNameLower, fullLower]) {
                // تطابق تام
                if (tradeLower.includes(name) || name.includes(tradeLower)) {
                    bestMatch = drug; bestScore = 0; bestConfidence = '100%'; break;
                }
                if (sciLower && (sciLower.includes(name) || name.includes(sciLower))) {
                    bestMatch = drug; bestScore = 0; bestConfidence = '98%'; break;
                }

                // تطابق أول كلمة
                const nameFirst  = name.split(/\s+/)[0];
                const tradeFirst = tradeLower.split(/\s+/)[0];
                const sciFirst   = sciLower.split(/\s+/)[0];

                if (nameFirst.length >= 4 && tradeFirst === nameFirst) {
                    bestMatch = drug; bestScore = 0.5; bestConfidence = '95%'; break;
                }
                if (sciFirst && nameFirst.length >= 4 && sciFirst === nameFirst) {
                    bestMatch = drug; bestScore = 0.5; bestConfidence = '92%'; break;
                }

                // تطابق ضبابي (Levenshtein)
                if (nameFirst.length >= 4 && tradeFirst.length >= 4) {
                    const dist   = levenshtein(nameFirst, tradeFirst);
                    const maxLen = Math.max(nameFirst.length, tradeFirst.length);
                    if (dist <= Math.min(3, Math.floor(maxLen * 0.35)) && dist < bestScore) {
                        bestMatch = drug; bestScore = dist;
                        bestConfidence = ((1 - dist / maxLen) * 100).toFixed(0) + '%';
                    }
                }
                if (sciFirst && nameFirst.length >= 4 && sciFirst.length >= 4) {
                    const dist   = levenshtein(nameFirst, sciFirst);
                    const maxLen = Math.max(nameFirst.length, sciFirst.length);
                    if (dist <= Math.min(3, Math.floor(maxLen * 0.35)) && dist < bestScore) {
                        bestMatch = drug; bestScore = dist;
                        bestConfidence = ((1 - dist / maxLen) * 100).toFixed(0) + '%';
                    }
                }
            }
            if (bestScore === 0) break;
        }

        if (bestMatch) {
            matchedIds.add(bestMatch.id);
            suggestions.push({
                id: bestMatch.id, tradeName: bestMatch.tradeName,
                scientificName: bestMatch.scientificName,
                confidence: bestConfidence, matchedFrom: extracted,
                inStock: true,
            });
        } else {
            // الدواء غير موجود في المخزون — أضفه للعرض مع تمييزه
            const displayName = baseName.length >= 3 ? baseName : extracted;
            if (displayName.length >= 3) {
                suggestions.push({
                    id: `not-in-stock-${displayName.replace(/\s+/g, '-')}`,
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
// نظام 1: Gemini AI Vision — أدق للخط اليدوي
// ══════════════════════════════════════════════════════════════════════════════

async function extractWithGemini(base64Image: string): Promise<{ rawText: string; extractedDrugs: string[] }> {
    const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    {
                        text: `You are an expert pharmacist analyzing a medical prescription image.

TASK: Extract ONLY the drug/medication names from this prescription.

RULES:
- Return ONLY drug names, one per line
- Include the drug form if visible (tablet, cream, spray, capsule, ointment, etc.)
- Include dosage/strength if visible (e.g., 500mg, 10%, 250mg)
- Do NOT include: patient name, doctor name, dates, instructions, dosage frequency, addresses, phone numbers
- Do NOT include: medical abbreviations like PR, BP, ACC, EKG, BMI, Age, Wt, Ht
- Do NOT include: "Rx", "TOTAL", quantities, or non-drug text
- If you cannot read a drug name clearly, try your best guess based on common medications
- Understand that doctors' handwriting can be messy — use medical context to infer drug names
- Return the result as a JSON array of strings, nothing else

Example output:
["Augmentin 625mg tablet", "Fusidic acid cream", "Paracetamol 500mg"]

IMPORTANT: Return ONLY the JSON array, no other text.`
                    },
                    {
                        inlineData: { mimeType: 'image/jpeg', data: base64Image },
                    }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        console.error('Gemini API Error:', data);
        throw new Error(data.error?.message || 'فشل تحليل الصورة بواسطة Gemini');
    }

    const rawGeminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let extractedDrugs: string[] = [];
    try {
        const jsonMatch = rawGeminiText.match(/\[[\s\S]*?\]/);
        if (jsonMatch) extractedDrugs = JSON.parse(jsonMatch[0]);
    } catch {
        extractedDrugs = rawGeminiText
            .split('\n')
            .map((l: string) => l.replace(/^[\d.\-*•]+\s*/, '').trim())
            .filter((l: string) => l.length >= 3);
    }

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

    // بحث عكسي: لكل دواء في المخزون، هل يظهر في النص؟
    const extractedDrugs: string[] = [];

    for (const drug of drugs) {
        const tradeLower = drug.tradeName.toLowerCase().replace(/[-_]/g, ' ').trim();
        const sciLower = (drug.scientificName || '').toLowerCase().replace(/[-_]/g, ' ').trim();

        // الاسم التجاري كاملاً
        if (tradeLower.length >= 3 && normalized.includes(tradeLower)) {
            extractedDrugs.push(drug.tradeName); continue;
        }
        // الاسم العلمي كاملاً
        if (sciLower.length >= 4 && normalized.includes(sciLower)) {
            extractedDrugs.push(drug.tradeName); continue;
        }
        // أول كلمة من الاسم التجاري
        const tradeFirst = tradeLower.split(/\s+/)[0];
        if (tradeFirst.length >= 4 && !NOISE_WORDS.has(tradeFirst) && ocrWords.includes(tradeFirst)) {
            extractedDrugs.push(drug.tradeName); continue;
        }
        // أول كلمة من الاسم العلمي
        const sciFirst = sciLower.split(/\s+/)[0];
        if (sciFirst && sciFirst.length >= 4 && !NOISE_WORDS.has(sciFirst) && ocrWords.includes(sciFirst)) {
            extractedDrugs.push(drug.tradeName); continue;
        }
        // تطابق ضبابي
        const candidates = [tradeFirst];
        if (sciFirst) candidates.push(sciFirst);
        for (const cand of candidates) {
            if (cand.length < 5 || NOISE_WORDS.has(cand)) continue;
            let found = false;
            for (const ocrWord of ocrWords) {
                if (ocrWord.length < 4 || Math.abs(ocrWord.length - cand.length) > 3) continue;
                const dist = levenshtein(cand, ocrWord);
                if (dist <= 2 && dist / Math.max(cand.length, ocrWord.length) < 0.25) {
                    extractedDrugs.push(drug.tradeName); found = true; break;
                }
            }
            if (found) break;
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

        const body = await req.json();
        const base64Image = body.image;

        if (!base64Image || typeof base64Image !== 'string') {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }
        if (base64Image.length > MAX_IMAGE_CHARS) {
            return NextResponse.json({ error: 'الصورة كبيرة جدًا' }, { status: 413 });
        }

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

        // ── اختيار النظام حسب الإعداد ────────────────────────────────────────
        let rawText: string;
        let suggestions;

        if (SCAN_PROVIDER === 'vision') {
            // نظام Google Vision + بحث عكسي
            const result = await extractWithVision(base64Image, drugs);
            rawText = result.rawText;
            // في نظام Vision، extractedDrugs هي أسماء الأدوية من المخزون مباشرةً
            suggestions = result.extractedDrugs.map(name => {
                const drug = drugs.find(d => d.tradeName === name);
                return drug ? {
                    id: drug.id, tradeName: drug.tradeName,
                    scientificName: drug.scientificName,
                    confidence: '85%', matchedFrom: name,
                } : null;
            }).filter(Boolean);
        } else {
            // نظام Gemini AI (الافتراضي)
            const result = await extractWithGemini(base64Image);
            rawText = result.rawText;
            suggestions = matchDrugsToInventory(result.extractedDrugs, drugs);
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
