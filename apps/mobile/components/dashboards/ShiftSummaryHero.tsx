import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Radius } from '../../constants/colors';
import { formatNumber, CURRENCY } from '../../utils/format';

export interface HeroMetric {
    icon: keyof typeof Ionicons.glyphMap;
    value: string | number;
    label: string;
    onPress?: () => void;
}

interface Props {
    title: string;                 // e.g. "ملخص وردية اليوم"
    dateLabel?: string;            // small date on the left
    revenue: number;               // big headline number (IQD)
    revenueLabel?: string;         // caption above the headline
    metrics: HeroMetric[];         // metric blocks row (2–3 items)
    headerIcon?: keyof typeof Ionicons.glyphMap;
    /** Override the accent colour (defaults to the theme primary). */
    accent?: string;
    /**
     * Metric strip style. 'tinted' keeps the manager's filled strip
     * (home-manager.png); 'plain' matches home-pharmacist.png: no fill, a rule
     * above, and the label under its number.
     */
    metricsVariant?: 'tinted' | 'plain';
    /** Side the headline sits on — the pharmacist design aligns it left. */
    revenueAlign?: 'right' | 'left';
}

/**
 * "Today / shift" summary card (home-manager.png, home-pharmacist.png):
 * flat white card, 8px radius, blue headline, tinted metric strip.
 */
export function ShiftSummaryHero({
    title,
    dateLabel,
    revenue,
    revenueLabel = 'إجمالي مبيعات اليوم',
    metrics,
    headerIcon = 'time-outline',
    accent,
    metricsVariant = 'tinted',
    revenueAlign = 'right',
}: Props) {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const accentColor = accent ?? C.primary;
    const plain = metricsVariant === 'plain';

    return (
        <View style={{ backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 38, height: 38, borderRadius: Radius.control, backgroundColor: C.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={headerIcon} size={20} color={accentColor} />
                    </View>
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>{title}</Text>
                </View>
                {dateLabel ? <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{dateLabel}</Text> : null}
            </View>

            <View style={{ alignItems: revenueAlign === 'left' ? 'flex-start' : 'flex-end' }}>
                <Text style={{ color: C.mutedForeground, fontSize: 13.5, marginBottom: 2 }}>{revenueLabel}</Text>
                <Text style={{ color: accentColor, fontSize: 34, fontWeight: '900' }}>
                    {formatNumber(Math.round(revenue))} <Text style={{ color: C.mutedForeground, fontSize: 15, fontWeight: '700' }}>{CURRENCY}</Text>
                </Text>
            </View>

            <View style={{
                flexDirection: 'row-reverse', overflow: 'hidden',
                backgroundColor: plain ? 'transparent' : C.primaryMuted,
                borderRadius: plain ? 0 : Radius.control,
                borderTopWidth: plain ? 1 : 0, borderTopColor: C.border,
                paddingTop: plain ? 4 : 0,
            }}>
                {metrics.map((m, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <View style={{ width: 1, backgroundColor: C.border, marginVertical: 10 }} />}
                        <TouchableOpacity
                            disabled={!m.onPress}
                            onPress={m.onPress}
                            activeOpacity={0.7}
                            accessibilityRole={m.onPress ? 'button' : undefined}
                            accessibilityLabel={`${m.value} ${m.label}`}
                            style={{
                                flex: 1, paddingVertical: plain ? 11 : 12, paddingHorizontal: 4,
                                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5,
                            }}
                        >
                            <Ionicons name={m.icon} size={17} color={accentColor} />
                            <Text
                                style={{ color: C.foreground, fontSize: plain ? 17 : 17, fontWeight: '900' }}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.7}
                            >
                                {typeof m.value === 'number' ? formatNumber(m.value) : m.value}
                            </Text>
                            <Text
                                style={{ color: C.mutedForeground, fontSize: 12.5 }}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                            >
                                {m.label}
                            </Text>
                        </TouchableOpacity>
                    </React.Fragment>
                ))}
            </View>
        </View>
    );
}

export default ShiftSummaryHero;
