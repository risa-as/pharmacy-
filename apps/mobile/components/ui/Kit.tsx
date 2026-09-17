/**
 * Mobile redesign 012 — shared building blocks.
 * Flat colours, cards 8px, controls 6px, badges 5px (constants/colors Radius).
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, TextInputProps, ActivityIndicator,
    ViewStyle, StyleProp, Pressable, TextStyle, TextProps,
    Animated, Easing, AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Palette, Radius } from '../../constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export function usePalette(): Palette {
    const { isDarkMode } = useTheme();
    return Colors(isDarkMode);
}

export function toneColors(C: Palette, tone: Tone): { fg: string; bg: string } {
    switch (tone) {
        case 'success': return { fg: C.success, bg: C.successBg };
        case 'warning': return { fg: C.warning, bg: C.warningBg };
        case 'danger': return { fg: C.danger, bg: C.dangerBg };
        case 'neutral': return { fg: C.mutedForeground, bg: C.input };
        default: return { fg: C.primary, bg: C.primaryMuted };
    }
}

// ── Surface card ──────────────────────────────────────────────────────────────
export function Surface({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
    const C = usePalette();
    return (
        <View style={[{
            backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border,
            padding: padded ? 16 : 0,
        }, style]}>
            {children}
        </View>
    );
}

// ── Icon tile ────────────────────────────────────────────────────────────────
export function IconTile({ icon, tone = 'primary', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
    const C = usePalette();
    const { fg, bg } = toneColors(C, tone);
    return (
        <View style={{ width: size, height: size, borderRadius: Radius.control, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={Math.round(size * 0.5)} color={fg} />
        </View>
    );
}

// ── Navigation arrow ─────────────────────────────────────────────────────────
// One consistent, left-pointing action affordance for RTL navigation rows.
export function NavigationArrow({ size = 32, color, backgroundColor }: {
    size?: number; color?: string; backgroundColor?: string;
}) {
    const C = usePalette();
    return (
        <View style={{
            width: size, height: size,
            backgroundColor: backgroundColor ?? 'transparent',
            alignItems: 'center', justifyContent: 'center',
        }}>
            <Ionicons name="chevron-back" size={Math.round(size * 0.72)} color={color ?? C.primary} />
        </View>
    );
}

// ── Tappable card ────────────────────────────────────────────────────────────
/** True while the enclosing PressableCard is held down (drives LinkLabel's nudge). */
const CardPressedContext = createContext(false);

/** Tracks the OS "reduce motion" setting so press animations can be skipped. */
export function useReduceMotion(): boolean {
    const [reduce, setReduce] = useState(false);
    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduce(v); }).catch(() => {});
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
        return () => { alive = false; sub.remove(); };
    }, []);
    return reduce;
}

// Whole-card press feedback (tinted fill + blue border) so a small inline
// chevron is enough to signal "opens".
export function PressableCard({ onPress, children, style, containerStyle, padded, accessibilityLabel, accessibilityHint }: {
    onPress: () => void;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    padded?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
}) {
    const C = usePalette();
    return (
        <Pressable
            onPress={onPress}
            style={containerStyle}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
        >
            {({ pressed }) => (
                <CardPressedContext.Provider value={pressed}>
                    <Surface padded={padded} style={[style, pressed && { backgroundColor: C.primaryMuted, borderColor: C.primary }]}>
                        {children}
                    </Surface>
                </CardPressedContext.Provider>
            )}
        </Pressable>
    );
}

// ── Link label ───────────────────────────────────────────────────────────────
// Card title followed by a thin chevron (design option «أ»): the affordance is
// part of the title, not a separate circled button. While the card is pressed
// the chevron nudges 3pt toward the navigation direction (left in RTL); it
// never moves at rest, and stays still when the OS asks to reduce motion.
const NUDGE_DISTANCE = -3;

export function LinkLabel({ label, style, chevronSize = 14, textProps }: {
    label: string;
    style?: StyleProp<TextStyle>;
    chevronSize?: number;
    textProps?: Omit<TextProps, 'style' | 'children'>;
}) {
    const C = usePalette();
    const pressed = useContext(CardPressedContext);
    const reduceMotion = useReduceMotion();
    const offset = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) { offset.setValue(0); return; }
        Animated.timing(offset, {
            toValue: pressed ? NUDGE_DISTANCE : 0,
            duration: pressed ? 120 : 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }).start();
    }, [pressed, reduceMotion, offset]);

    return (
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
            <Text {...textProps} style={[{ flexShrink: 1, textAlign: 'right' }, style]}>{label}</Text>
            <Animated.View style={{ marginTop: 2, transform: [{ translateX: offset }] }}>
                <Ionicons name="chevron-back" size={chevronSize} color={pressed ? C.primary : C.mutedForeground} />
            </Animated.View>
        </View>
    );
}

// ── Section title with the blue side bar ─────────────────────────────────────
export function SectionTitle({ title, trailing, onTrailingPress, style }: {
    title: string; trailing?: string; onTrailingPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
    const C = usePalette();
    return (
        <View style={[{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, style]}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: C.primary }} />
                <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>{title}</Text>
            </View>
            {trailing ? (
                onTrailingPress ? (
                    // Soft pill link: tinted fill + chevron so it reads as an action, not a caption.
                    <TouchableOpacity
                        onPress={onTrailingPress}
                        hitSlop={8}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={trailing}
                        style={{
                            flexDirection: 'row-reverse', alignItems: 'center', gap: 2,
                            backgroundColor: C.primaryMuted, borderRadius: Radius.control,
                            paddingVertical: 5, paddingRight: 10, paddingLeft: 6,
                        }}
                    >
                        <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>{trailing}</Text>
                        <Ionicons name="chevron-back" size={14} color={C.primary} />
                    </TouchableOpacity>
                ) : (
                    <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{trailing}</Text>
                )
            ) : null}
        </View>
    );
}

// ── Status badge (5px) ───────────────────────────────────────────────────────
export function StatusBadge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
    const C = usePalette();
    const { fg, bg } = toneColors(C, tone);
    return (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
            backgroundColor: bg, borderRadius: Radius.badge, paddingHorizontal: 9, paddingVertical: 4,
        }}>
            {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
            <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
        </View>
    );
}

// ── Informational note ───────────────────────────────────────────────────────
export function InfoNote({ text, title, tone = 'primary', style }: { text: string; title?: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
    const C = usePalette();
    const { fg, bg } = toneColors(C, tone);
    const icon: IconName = tone === 'danger' || tone === 'warning' ? 'alert-circle-outline' : 'information-circle-outline';
    return (
        <View style={[{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
            backgroundColor: bg, borderRadius: Radius.card, borderWidth: 1, borderColor: `${fg}33`,
            paddingHorizontal: 14, paddingVertical: 12,
        }, style]}>
            <Ionicons name={icon} size={22} color={fg} />
            <View style={{ flex: 1 }}>
                {title ? <Text style={{ color: fg, fontSize: 14, fontWeight: '800', textAlign: 'right' }}>{title}</Text> : null}
                <Text style={{ color: title ? C.mutedForeground : C.foreground, fontSize: 13, textAlign: 'right', lineHeight: 20 }}>{text}</Text>
            </View>
        </View>
    );
}

// ── Segmented tabs with bottom indicator ─────────────────────────────────────
export interface TabItem<K extends string> { key: K; label: string; count?: number; icon?: IconName }

export function SegmentedTabs<K extends string>({ items, value, onChange, style }: {
    items: TabItem<K>[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>;
}) {
    const C = usePalette();
    return (
        <View style={[{
            flexDirection: 'row-reverse', backgroundColor: C.card, borderRadius: Radius.card,
            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
        }, style]}>
            {items.map((it, i) => {
                const active = it.key === value;
                return (
                    <TouchableOpacity
                        key={it.key}
                        onPress={() => onChange(it.key)}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={{
                            flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                            {it.icon ? <Ionicons name={it.icon} size={16} color={active ? C.primary : C.mutedForeground} /> : null}
                            <Text style={{ color: active ? C.primary : C.mutedForeground, fontSize: 14, fontWeight: active ? '800' : '600' }} numberOfLines={1}>
                                {it.label}
                            </Text>
                            {it.count != null && (
                                <View style={{ minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: active ? C.primaryMuted : C.input, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: active ? C.primary : C.mutedForeground, fontSize: 11, fontWeight: '800' }}>{it.count}</Text>
                                </View>
                            )}
                        </View>
                        <View style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 3, borderRadius: 2, backgroundColor: active ? C.primary : 'transparent' }} />
                        {i < items.length - 1 && (
                            <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 1, backgroundColor: C.border }} />
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

// ── List row ──────────────────────────────────────────────────────────────────
export function ListRow({ icon, tone = 'primary', title, subtitle, onPress, trailing, showChevron = true, danger, divider }: {
    icon?: IconName; tone?: Tone; title: string; subtitle?: string; onPress?: () => void;
    trailing?: React.ReactNode; showChevron?: boolean; danger?: boolean; divider?: boolean;
}) {
    const C = usePalette();
    const content = (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14,
            borderBottomWidth: divider ? 1 : 0, borderBottomColor: C.border,
        }}>
            {icon ? <IconTile icon={icon} tone={danger ? 'danger' : tone} size={38} /> : null}
            <View style={{ flex: 1 }}>
                <Text style={{ color: danger ? C.danger : C.foreground, fontSize: 15, fontWeight: '700', textAlign: 'right' }} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
            {trailing}
            {onPress && showChevron ? <NavigationArrow size={30} color={C.mutedForeground} backgroundColor={C.input} /> : null}
        </View>
    );
    if (!onPress) return content;
    return <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button">{content}</TouchableOpacity>;
}

// ── Buttons ──────────────────────────────────────────────────────────────────
export function AppButton({ label, onPress, icon, variant = 'primary', loading, disabled, style, compact }: {
    label: string; onPress?: () => void; icon?: IconName;
    variant?: 'primary' | 'outline' | 'danger' | 'dangerOutline' | 'soft';
    loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; compact?: boolean;
}) {
    const C = usePalette();
    const isDisabled = disabled || loading;
    const palette = {
        primary: { bg: C.primary, fg: '#FFFFFF', border: C.primary },
        outline: { bg: C.card, fg: C.primary, border: C.primary },
        danger: { bg: C.danger, fg: '#FFFFFF', border: C.danger },
        dangerOutline: { bg: C.card, fg: C.danger, border: C.border },
        soft: { bg: C.primaryMuted, fg: C.primary, border: C.primaryMuted },
    }[variant];
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={isDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
            style={[{
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: compact ? 4 : 8,
                backgroundColor: isDisabled && variant === 'primary' ? C.border : palette.bg,
                borderWidth: 1, borderColor: isDisabled && variant === 'primary' ? C.border : palette.border,
                borderRadius: Radius.control, paddingVertical: compact ? 7 : 14, paddingHorizontal: compact ? 5 : 14,
                opacity: isDisabled && variant !== 'primary' ? 0.55 : 1,
            }, style]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : palette.fg} />
            ) : (
                <>
                    {icon ? <Ionicons name={icon} size={compact ? 14 : 19} color={isDisabled && variant === 'primary' ? C.mutedForeground : palette.fg} /> : null}
                    <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.68}
                        style={{ color: isDisabled && variant === 'primary' ? C.mutedForeground : palette.fg, fontSize: compact ? 11.5 : 15.5, fontWeight: '800' }}
                    >{label}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

// ── Form field ───────────────────────────────────────────────────────────────
export function FormField({ label, required, error, hint, suffix, trailing, containerStyle, multiline, ...inputProps }: TextInputProps & {
    label: string; required?: boolean; error?: string | null; hint?: string; suffix?: string;
    /** Node rendered inside the field on the left (e.g. a show-password toggle). */
    trailing?: React.ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
}) {
    const C = usePalette();
    const [focused, setFocused] = React.useState(false);
    return (
        <View style={[{ gap: 6 }, containerStyle]}>
            <Text style={{ color: C.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>
                {label}{required ? <Text style={{ color: C.danger }}> *</Text> : null}
            </Text>
            <View style={{
                flexDirection: 'row-reverse', alignItems: multiline ? 'flex-start' : 'center',
                backgroundColor: C.card, borderRadius: Radius.control, borderWidth: focused ? 1.5 : 1,
                borderColor: error ? C.danger : focused ? C.primary : C.border, overflow: 'hidden',
            }}>
                <TextInput
                    placeholderTextColor={C.mutedForeground}
                    multiline={multiline}
                    {...inputProps}
                    onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
                    style={[{
                        flex: 1, color: C.foreground, fontSize: 15, textAlign: 'right',
                        paddingHorizontal: 14, paddingVertical: 12, minHeight: multiline ? 90 : undefined,
                        textAlignVertical: multiline ? 'top' : 'center',
                    }, inputProps.style]}
                />
                {trailing}
                {suffix ? (
                    <View style={{ alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: C.input, borderRightWidth: 1, borderRightColor: C.border }}>
                        <Text style={{ color: C.mutedForeground, fontSize: 14, fontWeight: '700' }}>{suffix}</Text>
                    </View>
                ) : null}
            </View>
            {error ? (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="alert-circle-outline" size={15} color={C.danger} />
                    <Text style={{ color: C.danger, fontSize: 12.5, textAlign: 'right' }}>{error}</Text>
                </View>
            ) : hint ? (
                <Text style={{ color: C.mutedForeground, fontSize: 12, textAlign: 'right' }}>{hint}</Text>
            ) : null}
        </View>
    );
}

// ── Stat cell (label + big value) ────────────────────────────────────────────
export function StatCell({ label, value, suffix, tone = 'neutral', align = 'right' }: {
    label: string; value: string; suffix?: string; tone?: Tone; align?: 'right' | 'center';
}) {
    const C = usePalette();
    const color = tone === 'neutral' ? C.foreground : toneColors(C, tone).fg;
    return (
        <View style={{ flex: 1, alignItems: align === 'center' ? 'center' : 'flex-end', gap: 4 }}>
            <Text style={{ color: C.mutedForeground, fontSize: 12.5 }}>{label}</Text>
            <Text style={{ color, fontSize: 20, fontWeight: '900' }}>
                {value}{suffix ? <Text style={{ color: C.mutedForeground, fontSize: 12, fontWeight: '600' }}> {suffix}</Text> : null}
            </Text>
        </View>
    );
}

/** Thin vertical divider used between stat cells. */
export function VDivider() {
    const C = usePalette();
    return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 8 }} />;
}

/** Centered loading / empty / error block. */
export function StateBlock({ icon, title, message, actionLabel, onAction, loading }: {
    icon?: IconName; title: string; message?: string; actionLabel?: string; onAction?: () => void; loading?: boolean;
}) {
    const C = usePalette();
    return (
        <View style={{ flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingVertical: 42, paddingHorizontal: 28, gap: 10 }}>
            {loading ? (
                <ActivityIndicator size="large" color={C.primary} />
            ) : icon ? (
                <View style={{ width: 82, height: 82, borderRadius: 41, backgroundColor: C.primaryMuted, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={icon} size={38} color={C.primary} />
                </View>
            ) : null}
            <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>{title}</Text>
            {message ? <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'center', lineHeight: 21, maxWidth: 310 }}>{message}</Text> : null}
            {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} variant="outline" compact style={{ marginTop: 8, minWidth: 160 }} /> : null}
        </View>
    );
}
