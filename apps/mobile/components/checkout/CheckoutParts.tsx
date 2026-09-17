/**
 * Pieces shared by the cart (sales tab) and the payment review screen.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../constants/colors';
import { usePalette, toneColors } from '../ui/Kit';
import { useCheckout } from '../../context/CheckoutContext';
import { formatIQD, formatNumber } from '../../utils/format';

/**
 * Allergy + interaction warnings. A failed or pending check is shown as such —
 * never as "no interactions" (navigation-map §6).
 */
export function SafetyWarnings({ compact }: { compact?: boolean }) {
    const C = usePalette();
    const { interactions, allergyWarnings, safetyStatus, recheckSafety } = useCheckout();

    if (safetyStatus === 'idle') return null;

    if (safetyStatus === 'checking' && interactions.length === 0 && allergyWarnings.length === 0) {
        return (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>جارِ فحص التداخلات والحساسية…</Text>
            </View>
        );
    }

    const rows: Array<{ key: string; tone: 'danger' | 'warning'; title: string; body: string }> = [
        ...allergyWarnings.map((w, i) => ({ key: `a${i}`, tone: 'danger' as const, title: 'تحذير حساسية', body: w })),
        ...interactions.map((ix, i) => ({
            key: `i${i}`,
            tone: ix.severity === 'HIGH' ? 'danger' as const : 'warning' as const,
            title: `تداخل دوائي ${ix.severity === 'HIGH' ? '(خطير)' : '(متوسط)'}`,
            body: `${ix.drug1} + ${ix.drug2} — ${ix.description}`,
        })),
    ];

    return (
        <View style={{ gap: 8 }}>
            {safetyStatus === 'failed' && (
                <View style={{
                    flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12,
                    backgroundColor: C.warningBg, borderRadius: Radius.card, borderWidth: 1, borderColor: `${C.warning}40`,
                }}>
                    <Ionicons name="cloud-offline-outline" size={20} color={C.warning} />
                    <Text style={{ flex: 1, color: C.foreground, fontSize: 13, textAlign: 'right', lineHeight: 19 }}>
                        تعذّر فحص التداخلات والحساسية. هذا لا يعني عدم وجودها — راجع الأصناف يدوياً.
                    </Text>
                    <TouchableOpacity onPress={recheckSafety} hitSlop={8}>
                        <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>إعادة</Text>
                    </TouchableOpacity>
                </View>
            )}
            {rows.map(r => {
                const { fg, bg } = toneColors(C, r.tone);
                return (
                    <View key={r.key} style={{
                        flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, padding: compact ? 10 : 12,
                        backgroundColor: bg, borderRadius: Radius.card, borderWidth: 1, borderColor: `${fg}40`,
                    }}>
                        <Ionicons name="warning-outline" size={20} color={fg} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: fg, fontSize: 14, fontWeight: '800', textAlign: 'right' }}>{r.title}</Text>
                            <Text style={{ color: C.foreground, fontSize: 13, textAlign: 'right', marginTop: 2, lineHeight: 19 }}>{r.body}</Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

/** Loyalty balance + redemption stepper (shown once a customer is selected). */
export function LoyaltyPanel() {
    const C = usePalette();
    const {
        patient, loyaltySettings, loyaltyAccount, pointsToRedeem, setPointsToRedeem,
        maxRedeemablePoints, loyaltyDiscount, minRedemption,
    } = useCheckout();

    if (!patient || !loyaltySettings?.loyaltyEnabled || !loyaltyAccount) return null;

    const tierLabel = loyaltyAccount.tier === 'GOLD' ? 'ذهبي' : loyaltyAccount.tier === 'SILVER' ? 'فضي' : 'برونزي';
    const belowMin = loyaltyAccount.totalPoints < minRedemption;

    return (
        <View style={{ backgroundColor: C.card, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="star-outline" size={18} color={C.primary} />
                    <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800' }}>نقاط الولاء</Text>
                    <View style={{ backgroundColor: C.primaryMuted, borderRadius: Radius.badge, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: C.primary, fontSize: 12, fontWeight: '700' }}>{tierLabel}</Text>
                    </View>
                </View>
                <Text style={{ color: C.mutedForeground, fontSize: 13 }}>الرصيد {formatNumber(loyaltyAccount.totalPoints)} نقطة</Text>
            </View>

            {belowMin ? (
                <Text style={{ color: C.mutedForeground, fontSize: 12.5, textAlign: 'right' }}>
                    الحد الأدنى للاستبدال {formatNumber(minRedemption)} نقطة
                </Text>
            ) : (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, color: C.foreground, fontSize: 13.5, textAlign: 'right' }}>
                        استبدال {formatNumber(pointsToRedeem)} نقطة
                        {loyaltyDiscount > 0 ? <Text style={{ color: C.success, fontWeight: '700' }}>{`  ·  خصم ${formatIQD(loyaltyDiscount)}`}</Text> : null}
                    </Text>
                    <Stepper
                        onMinus={() => setPointsToRedeem(pointsToRedeem - 100)}
                        onPlus={() => setPointsToRedeem(Math.min(pointsToRedeem + 100, maxRedeemablePoints))}
                        minusDisabled={pointsToRedeem <= 0}
                        plusDisabled={pointsToRedeem >= maxRedeemablePoints}
                    />
                </View>
            )}
        </View>
    );
}

/** −/value/+ control. */
export function Stepper({ value, onMinus, onPlus, minusDisabled, plusDisabled, onValuePress }: {
    value?: number; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean;
    /** Makes the number itself tappable, for typing a quantity directly. */
    onValuePress?: () => void;
}) {
    const C = usePalette();
    const btn = (icon: 'remove' | 'add', onPress: () => void, disabled?: boolean, label?: string) => (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{ width: 40, height: 38, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
        >
            <Ionicons name={icon} size={18} color={C.primary} />
        </TouchableOpacity>
    );
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border,
            borderRadius: Radius.control, backgroundColor: C.card, overflow: 'hidden',
        }}>
            {btn('remove', onMinus, minusDisabled, 'إنقاص')}
            {value !== undefined && (
                <TouchableOpacity
                    onPress={onValuePress}
                    disabled={!onValuePress}
                    accessibilityRole={onValuePress ? 'button' : undefined}
                    accessibilityLabel={onValuePress ? 'تعديل الكمية' : undefined}
                    style={{ minWidth: 42, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }}
                >
                    <Text style={{ color: C.foreground, fontSize: 16, fontWeight: '800' }}>{value}</Text>
                </TouchableOpacity>
            )}
            {btn('add', onPlus, plusDisabled, 'زيادة')}
        </View>
    );
}
