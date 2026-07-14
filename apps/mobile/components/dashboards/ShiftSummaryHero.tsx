import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Radius } from '../../constants/colors';

export interface HeroMetric {
    icon: keyof typeof Ionicons.glyphMap;
    value: string | number;
    label: string;
    onPress?: () => void;
}

interface Props {
    title: string;                 // e.g. "ملخص وردية اليوم"
    dateLabel?: string;            // small date/time on the left
    revenue: number;               // big headline number (IQD)
    revenueLabel?: string;         // caption under the headline
    metrics: HeroMetric[];         // metric blocks row (2–3 items)
    headerIcon?: keyof typeof Ionicons.glyphMap;
    /** Override the solid card colour (defaults to the theme primary). */
    accent?: string;
}

/**
 * Branded "shift / today" summary hero.
 *
 * Variant: a light card with a coloured border and accent details (number,
 * icons, tinted metric strip) instead of a full accent-filled background — so
 * the brand colour reads as identity without dominating the screen. Shared by
 * the Admin and Pharmacist home screens; the accent comes from `accent`.
 */
export function ShiftSummaryHero({
    title,
    dateLabel,
    revenue,
    revenueLabel = 'إجمالي مبيعات اليوم',
    metrics,
    headerIcon = 'time-outline',
    accent,
}: Props) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const accentColor = accent ?? C.primary;
    const tintStrong = `${accentColor}1F`; // ~12% — icon tiles
    const tintSoft = `${accentColor}14`;   // ~8%  — metric strip surface

    return (
        <View
            style={{
                borderRadius: Radius.sm,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.06,
                shadowRadius: 10,
                elevation: 2,
            }}
        >
            <View style={{
                borderRadius: Radius.sm, overflow: 'hidden',
                backgroundColor: C.card,
                borderWidth: 1.5, borderColor: `${accentColor}33`,
                padding: 16,
            }}>

                {/* Header — icon tile + title (right), date (left) */}
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <View style={{
                            width: 30, height: 30, borderRadius: Radius.xs,
                            backgroundColor: tintStrong, alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Ionicons name={headerIcon} size={15} color={accentColor} />
                        </View>
                        <Text style={{ color: C.foreground, fontSize: 13, fontWeight: '800' }}>{title}</Text>
                    </View>
                    {dateLabel ? (
                        <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }}>{dateLabel}</Text>
                    ) : null}
                </View>

                {/* Headline revenue */}
                <View style={{ alignItems: 'flex-end', marginTop: 14 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600', marginBottom: 3 }}>
                        {revenueLabel}
                    </Text>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 5 }}>
                        <Text style={{ color: accentColor, fontSize: 28, fontWeight: '900', letterSpacing: 0.3 }}>
                            {Math.round(revenue).toLocaleString('en-US')}
                        </Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 13, fontWeight: '700' }}>د.ع</Text>
                    </View>
                </View>

                {/* Metric strip — single compact line per cell, on a soft accent tint */}
                <View style={{
                    flexDirection: 'row-reverse', marginTop: 14,
                    backgroundColor: tintSoft,
                    borderRadius: Radius.xs, overflow: 'hidden',
                }}>
                    {metrics.map((m, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <View style={{ width: 1, backgroundColor: C.border, marginVertical: 9 }} />}
                            <TouchableOpacity
                                disabled={!m.onPress}
                                onPress={m.onPress}
                                activeOpacity={0.7}
                                style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                            >
                                <Ionicons name={m.icon} size={13} color={accentColor} />
                                <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '900' }} numberOfLines={1}>
                                    {typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value}
                                </Text>
                                <Text style={{ color: C.mutedForeground, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                                    {m.label}
                                </Text>
                            </TouchableOpacity>
                        </React.Fragment>
                    ))}
                </View>
            </View>
        </View>
    );
}

export default ShiftSummaryHero;
