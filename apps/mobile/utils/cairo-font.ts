import type { TextStyle } from 'react-native';

export const CAIRO_FAMILIES = {
    200: 'Cairo_200ExtraLight',
    300: 'Cairo_300Light',
    400: 'Cairo_400Regular',
    500: 'Cairo_500Medium',
    600: 'Cairo_600SemiBold',
    700: 'Cairo_700Bold',
    800: 'Cairo_800ExtraBold',
    900: 'Cairo_900Black',
} as const;

/** Runtime-loaded faces need explicit weight selection on both Android and iOS. */
export function cairoFaceStyle(
    style: Pick<TextStyle, 'fontFamily' | 'fontWeight'> = {},
    inheritedWeight: TextStyle['fontWeight'] = '400',
): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
    // Preserve intentional non-proportional text (account identifiers, for example).
    if (style.fontFamily && !style.fontFamily.startsWith('Cairo')) return {};
    const namedWeight = style.fontFamily?.match(/^Cairo_(\d+)/)?.[1];
    const weight = style.fontWeight ?? namedWeight ?? inheritedWeight ?? '400';
    const numeric = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
    const normalized = Number.isFinite(numeric) ? Math.max(200, Math.min(900, Math.round(numeric / 100) * 100)) : 400;
    return { fontFamily: CAIRO_FAMILIES[normalized as keyof typeof CAIRO_FAMILIES], fontWeight: 'normal' };
}
