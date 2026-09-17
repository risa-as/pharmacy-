import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert as RNAlert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors, Radius } from '../constants/colors';

export interface ThemedAlertButton {
    text?: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface AlertConfig {
    title: string;
    message?: string;
    buttons?: ThemedAlertButton[];
}

type ShowFn = (config: AlertConfig) => void;

let _show: ShowFn | null = null;

// ── Patch react-native's Alert ────────────────────────────────────────────────
// Every existing `Alert.alert(...)` across the app routes through our branded
// modal — no call-site changes needed. Because `import { Alert } from
// "react-native"` returns the same singleton object everywhere, reassigning its
// `.alert` here intercepts all callers. Falls back to the native alert if the
// host isn't mounted yet.
const _origAlert = RNAlert.alert.bind(RNAlert);
(RNAlert as any).alert = (
    title: string,
    message?: string,
    buttons?: ThemedAlertButton[],
    options?: any,
) => {
    if (_show) {
        _show({ title, message: typeof message === 'string' ? message : undefined, buttons });
    } else {
        _origAlert(title, message as any, buttons as any, options);
    }
};

/** Two buttons sit side by side; three or more stack. */
const SIDE_BY_SIDE = 2;

/**
 * Mount once at the app root (inside ThemeProvider). Renders the branded modal
 * that backs every Alert.alert call.
 */
export default function ThemedAlertHost() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);
    const [config, setConfig] = useState<AlertConfig | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        _show = (c) => { setConfig(c); setVisible(true); };
        return () => { _show = null; };
    }, []);

    const close = useCallback(() => setVisible(false), []);

    const runButton = (btn?: ThemedAlertButton) => {
        close();
        // Defer onPress so the dismiss animation runs smoothly first.
        if (btn?.onPress) setTimeout(() => btn.onPress!(), 130);
    };

    const rawButtons: ThemedAlertButton[] =
        config?.buttons && config.buttons.length > 0
            ? config.buttons
            : [{ text: 'حسناً', style: 'default' }];

    // Push "cancel" buttons to the bottom so the primary action stays prominent.
    const buttons = [...rawButtons].sort(
        (a, b) => (a.style === 'cancel' ? 1 : 0) - (b.style === 'cancel' ? 1 : 0),
    );

    const titleStr = config?.title ?? '';
    const isDestructive = buttons.some((b) => b.style === 'destructive');
    const isError = /خطأ|فشل|تعذّر|تعذر|تحذير|تنبيه/.test(titleStr);
    const isSuccess = /تم |نجاح|بنجاح/.test(titleStr);
    const cancelButton = rawButtons.find((b) => b.style === 'cancel');

    // Colours come from the app palette (constants/colors), like every other screen.
    const accent = isDestructive ? C.danger : isError ? C.warning : isSuccess ? C.success : C.primary;
    const iconBg = isDestructive ? C.dangerBg : isError ? C.warningBg : isSuccess ? C.successBg : C.primaryMuted;
    const iconName = isDestructive ? 'alert-circle-outline'
        : isError ? 'warning-outline'
            : isSuccess ? 'checkmark-circle-outline'
                : 'information-circle-outline';
    const inRow = buttons.length === SIDE_BY_SIDE;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => runButton(cancelButton)}
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                        <Ionicons name={iconName as any} size={32} color={accent} />
                    </View>

                    {!!config?.title && (
                        <Text style={[styles.title, { color: C.foreground }]}>{config.title}</Text>
                    )}
                    {!!config?.message && (
                        <Text style={[styles.message, { color: C.mutedForeground }]}>{config.message}</Text>
                    )}

                    <View style={[styles.actions, inRow && styles.actionsRow]}>
                        {buttons.map((btn, i) => {
                            const variant = btn.style ?? 'default';
                            const isCancel = variant === 'cancel';
                            const fill = variant === 'destructive' ? C.danger : C.primary;
                            return (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => runButton(btn)}
                                    activeOpacity={isCancel ? 0.7 : 0.85}
                                    accessibilityRole="button"
                                    style={[
                                        styles.btn,
                                        inRow && styles.btnInRow,
                                        isCancel
                                            ? { backgroundColor: C.card, borderWidth: 1, borderColor: C.border }
                                            : { backgroundColor: fill, borderWidth: 1, borderColor: fill },
                                    ]}
                                >
                                    <Text
                                        numberOfLines={1}
                                        style={[styles.btnText, { color: isCancel ? C.mutedForeground : '#FFFFFF' }]}
                                    >
                                        {btn.text ?? (isCancel ? 'إلغاء' : 'حسناً')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(17,24,39,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 28,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        borderRadius: Radius.card,
        borderWidth: 1,
        padding: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 6,
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    title: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
    message: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 18 },
    actions: { width: '100%', gap: 10 },
    // Two buttons share one line: the main action on the right (RTL).
    actionsRow: { flexDirection: 'row-reverse' },
    btn: { width: '100%', height: 46, borderRadius: Radius.control, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
    btnInRow: { width: undefined, flex: 1 },
    btnText: { fontSize: 15, fontWeight: '800' },
});
