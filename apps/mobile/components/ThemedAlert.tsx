import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert as RNAlert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';

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

const PRIMARY = '#0F7575';
const DANGER = '#dc2626';
const WARN = '#d97706';

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
    const cancelButton = rawButtons.find((b) => b.style === 'cancel');

    const accent = isDestructive ? DANGER : isError ? WARN : PRIMARY;
    const iconName = isDestructive ? 'alert-circle' : isError ? 'warning' : 'information-circle';
    const iconBg = isDestructive
        ? 'rgba(220,38,38,0.12)'
        : isError
            ? 'rgba(217,119,6,0.12)'
            : 'rgba(15,117,117,0.12)';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => runButton(cancelButton)}
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: C.card }]}>
                    <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                        <Ionicons name={iconName as any} size={34} color={accent} />
                    </View>

                    {!!config?.title && (
                        <Text style={[styles.title, { color: C.foreground }]}>{config.title}</Text>
                    )}
                    {!!config?.message && (
                        <Text style={[styles.message, { color: C.mutedForeground }]}>{config.message}</Text>
                    )}

                    <View style={styles.actions}>
                        {buttons.map((btn, i) => {
                            const variant = btn.style ?? 'default';
                            if (variant === 'cancel') {
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        onPress={() => runButton(btn)}
                                        activeOpacity={0.7}
                                        style={[styles.btn, styles.btnGhost, { borderColor: C.border }]}
                                    >
                                        <Text style={[styles.btnText, { color: C.mutedForeground }]}>
                                            {btn.text ?? 'إلغاء'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }
                            const bg = variant === 'destructive' ? DANGER : PRIMARY;
                            return (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => runButton(btn)}
                                    activeOpacity={0.85}
                                    style={[styles.btn, { backgroundColor: bg }]}
                                >
                                    <Text style={[styles.btnText, styles.btnTextFilled]}>
                                        {btn.text ?? 'حسناً'}
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
        borderRadius: 5,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 16,
    },
    iconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    message: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
    actions: { width: '100%', gap: 10 },
    btn: { width: '100%', height: 50, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
    btnGhost: { backgroundColor: 'transparent', borderWidth: 1.5 },
    btnText: { fontSize: 15, fontWeight: '700' },
    btnTextFilled: { color: '#fff', fontWeight: '800' },
});
