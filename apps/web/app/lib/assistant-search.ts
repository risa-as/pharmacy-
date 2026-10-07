export function normalizeSearchName(value: string) {
    return value.toLowerCase().replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
/** Search spellings, never treatment alternatives or fuzzy guesses. */
export function drugSearchTerms(value: string): string[] {
    const name = normalizeSearchName(value).replace(/^ال/, '');
    const known: Record<string, string[]> = {
        'باراسيتامول': ['paracetamol', 'acetaminophen'],
        'بنادول': ['panadol'], 'بندول': ['panadol'], 'بانادول': ['panadol'],
        'اموكسيسيلين': ['amoxicillin'], 'اموكسسلين': ['amoxicillin'], 'اموكسيل': ['amoxil'],
        'ايبوبروفين': ['ibuprofen'], 'ابوبروفين': ['ibuprofen'],
        'اسبرين': ['aspirin', 'acetylsalicylic acid'],
    };
    return Array.from(new Set([value.trim(), name, ...(known[name] ?? [])])).filter(Boolean);
}
export function extractDebtName(message: string, kind: 'patient' | 'supplier'): string | null {
    const text = message.replace(/[؟?،,]/g, '').trim();
    const who = kind === 'supplier' ? '(?:المورد|مورد)' : '(?:المريض|مريض|الزبون|زبون|العميل|عميل)';
    const after = text.match(new RegExp(`(?:دين|ديون|رصيد)\\s+${who}\\s+(?:الخاص\\s+ب)?(.+)$`))?.[1]
        ?? (kind === 'patient' ? text.match(/(?:كم|شكد)\s+دين\s+(.+)$/)?.[1] : undefined);
    const name = after?.trim();
    if (!name || /^(?:المريض|مريض|الزبون|زبون|العميل|عميل|المورد|مورد|الموردين|المرضى|العملاء|اليوم)$/.test(name)) return null;
    return name;
}
