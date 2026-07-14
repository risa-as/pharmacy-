/**
 * Faramace Mobile — Design Token Color Constants
 *
 * These values mirror `packages/shared/tailwind.config.ts → staticTokens`.
 * ⚠ Keep in sync when updating the shared config.
 *
 * Usage:
 *   - For Ionicons / image tint props: `<Ionicons color={Colors.light.primary} />`
 *   - For future NativeWind className migration, prefer `className="text-primary"` instead.
 *   - For StyleSheet.create inline styles, use these named constants instead of raw hex
 *     literals so changes propagate from one place.
 *
 * Migration note:
 *   Existing screens use StyleSheet.create with inline hex values (pre-existing debt).
 *   New screens MUST use NativeWind className props. When refactoring existing screens,
 *   replace StyleSheet hex values with these constants first, then migrate to className.
 */

/** Light-mode palette — matches staticTokens light values */
export const LightColors = {
    // Brand
    primary:    '#0F7575',
    primarySoft:'#1CABAC',
    primaryMuted:'#E6F4F4',

    // Semantic
    success:    '#2D8A52',
    successBg:  '#E8F5EE',
    warning:    '#C47820',
    warningBg:  '#FDF3E3',
    danger:     '#B03030',
    dangerBg:   '#FAEAEA',
    info:       '#2B6F8F',
    infoBg:     '#E5F1F7',

    // Surfaces
    background: '#FAFAF8',
    card:       '#FFFFFF',
    border:     '#E8E3DC',
    input:      '#E8E3DC',

    // Text
    foreground:       '#18120F',
    mutedForeground:  '#7A7068',
    cardForeground:   '#18120F',
} as const;

/** Dark-mode palette — matches staticTokens dark values */
export const DarkColors = {
    // Brand
    primary:    '#1CABAC',
    primarySoft:'#0F7575',
    primaryMuted:'#0F2B2B',

    // Semantic
    success:    '#44C47A',
    successBg:  '#0D2B1A',
    warning:    '#D4934A',
    warningBg:  '#2B1C08',
    danger:     '#D86B6B',
    dangerBg:   '#2B0E0E',
    info:       '#5B9FBE',
    infoBg:     '#0C1E29',

    // Surfaces
    background: '#181614',
    card:       '#211E1B',
    border:     '#2E2924',
    input:      '#2E2924',

    // Text
    foreground:       '#F5EFE8',
    mutedForeground:  '#A09488',
    cardForeground:   '#F5EFE8',
} as const;

/**
 * Shared corner-radius scale.
 * Kept deliberately small for a crisp, modern look — change here to retune globally.
 *   xs → icon tiles, pills, chips, dividers
 *   sm → cards, hero, buttons (default surface radius)
 *   md → large surfaces / sheets
 */
export const Radius = {
    xs: 4,
    sm: 6,
    md: 8,
} as const;

/**
 * Convenience helper — returns the correct palette based on the OS color scheme.
 *
 * @example
 * const { isDarkMode } = useTheme();
 * const C = Colors(isDarkMode);
 * <Ionicons color={C.primary} />
 */
export function Colors(isDark: boolean) {
    return isDark ? DarkColors : LightColors;
}

/**
 * Medical-blue palette — scoped to the manager-only screens (home, reports).
 * Mirrors the shape of `Colors` but swaps the teal brand for a clinical blue
 * with cooler slate neutrals. Other (shared) screens keep the global theme.
 */
export function managerPalette(isDark: boolean) {
    return isDark
        ? {
            primary: '#3B8FD6', primarySoft: '#1E6FBF', primaryMuted: '#0E2740',
            success: '#44C47A', successBg: '#0D2B1A',
            warning: '#D4934A', warningBg: '#2B1C08',
            danger:  '#D86B6B', dangerBg:  '#2B0E0E',
            info:    '#2DB3B3', infoBg:    '#0C2424',
            background: '#0E1620', card: '#16202C', border: '#243140', input: '#243140',
            foreground: '#EAF0F7', mutedForeground: '#94A3B8',
        }
        : {
            primary: '#1E6FBF', primarySoft: '#3B8FD6', primaryMuted: '#E6F0FA',
            success: '#2D8A52', successBg: '#E8F5EE',
            warning: '#C47820', warningBg: '#FDF3E3',
            danger:  '#B03030', dangerBg:  '#FAEAEA',
            info:    '#0E8C8C', infoBg:    '#E3F4F4',
            background: '#F4F7FB', card: '#FFFFFF', border: '#E2E8F0', input: '#E2E8F0',
            foreground: '#16202C', mutedForeground: '#64748B',
        };
}

export default Colors;
