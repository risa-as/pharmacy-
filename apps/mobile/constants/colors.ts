/**
 * Faramace Mobile — Design Token Color Constants
 *
 * One medical-blue identity for every screen (mobile redesign 012, see
 * specs/012-mobile-redesign). Flat colours only — no gradients.
 *
 * Status semantics (navigation-map §12):
 *   warning (orange) → low stock / near expiry / pending
 *   danger  (red)    → expired / critical
 *   success (green)  → healthy / completed
 *
 * Usage:
 *   const { isDarkMode } = useTheme();
 *   const C = Colors(isDarkMode);
 */

/** Light-mode palette */
export const LightColors = {
    // Brand
    primary:     '#1E6FBF',
    primarySoft: '#3B8FD6',
    primaryMuted:'#E8F1FA',

    // Semantic
    success:    '#2D8A52',
    successBg:  '#E8F5EE',
    warning:    '#C47820',
    warningBg:  '#FDF3E3',
    danger:     '#B03030',
    dangerBg:   '#FAEAEA',
    info:       '#1E6FBF',
    infoBg:     '#EAF2FB',

    // Surfaces
    background: '#F4F7FB',
    card:       '#FFFFFF',
    border:     '#DCE5EF',
    input:      '#F1F5F9',

    // Text
    foreground:       '#172B43',
    mutedForeground:  '#62748A',
    cardForeground:   '#172B43',
} as const;

/** Dark-mode palette */
export const DarkColors = {
    // Brand
    primary:     '#3B8FD6',
    primarySoft: '#1E6FBF',
    primaryMuted:'#0E2740',

    // Semantic
    success:    '#44C47A',
    successBg:  '#0D2B1A',
    warning:    '#D4934A',
    warningBg:  '#2B1C08',
    danger:     '#D86B6B',
    dangerBg:   '#2B0E0E',
    info:       '#3B8FD6',
    infoBg:     '#0E2740',

    // Surfaces
    background: '#0E1620',
    card:       '#16202C',
    border:     '#243140',
    input:      '#1B2733',

    // Text
    foreground:       '#EAF0F7',
    mutedForeground:  '#94A3B8',
    cardForeground:   '#EAF0F7',
} as const;

export type Palette = { [K in keyof typeof LightColors]: string };

/**
 * Shared corner-radius scale (design rule: cards 8, controls 6, badges 5).
 *   badge / xs → pills, chips, status badges, icon tiles
 *   control / sm → buttons, inputs, segmented controls
 *   card / md → cards, sheets, large surfaces
 */
export const Radius = {
    xs: 5,
    sm: 6,
    md: 8,
    badge: 5,
    control: 6,
    card: 8,
} as const;

/**
 * Returns the palette for the current theme.
 *
 * @example
 * const { isDarkMode } = useTheme();
 * const C = Colors(isDarkMode);
 * <Ionicons color={C.primary} />
 */
export function Colors(isDark: boolean): Palette {
    return isDark ? DarkColors : LightColors;
}

/**
 * Kept for existing call sites — the manager and shared screens now use the
 * same blue palette, so this is an alias of `Colors`.
 */
export function managerPalette(isDark: boolean): Palette {
    return Colors(isDark);
}

export default Colors;
