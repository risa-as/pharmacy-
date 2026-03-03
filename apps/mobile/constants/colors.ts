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

export default Colors;
