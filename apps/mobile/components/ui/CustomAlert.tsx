import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    Animated,
    StyleSheet,
    Dimensions,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';
import { registerAlertHandler, AlertButton } from '../../utils/alert';

type AlertType = 'success' | 'error' | 'warning' | 'confirm' | 'info';

interface AlertState {
    visible: boolean;
    title: string;
    message?: string;
    buttons: AlertButton[];
    type: AlertType;
}

const { width } = Dimensions.get('window');

function detectType(title: string): AlertType {
    if (title.includes('خطأ') || title.includes('فشل') || title.includes('تعذّر') || title.includes('تعذر'))
        return 'error';
    if (title.includes('تنبيه') || title.includes('تحذير') || title.includes('انتبه'))
        return 'warning';
    if (
        title.includes('تم') ||
        title.includes('نجاح') ||
        title.includes('تمت') ||
        title.includes('نجح') ||
        title.includes('بنجاح')
    )
        return 'success';
    if (
        title.includes('تأكيد') ||
        title.includes('حذف') ||
        title.includes('إلغاء') ||
        title.includes('تسجيل الخروج')
    )
        return 'confirm';
    return 'info';
}

const TYPE_CONFIG = {
    success: {
        icon: 'checkmark-circle' as const,
        color: (C: ReturnType<typeof Colors>) => C.success,
        bg:    (C: ReturnType<typeof Colors>) => C.successBg,
    },
    error: {
        icon: 'alert-circle' as const,
        color: (C: ReturnType<typeof Colors>) => C.danger,
        bg:    (C: ReturnType<typeof Colors>) => C.dangerBg,
    },
    warning: {
        icon: 'warning' as const,
        color: (C: ReturnType<typeof Colors>) => C.warning,
        bg:    (C: ReturnType<typeof Colors>) => C.warningBg,
    },
    confirm: {
        icon: 'help-circle' as const,
        color: (C: ReturnType<typeof Colors>) => C.primary,
        bg:    (C: ReturnType<typeof Colors>) => C.primaryMuted,
    },
    info: {
        icon: 'information-circle' as const,
        color: (C: ReturnType<typeof Colors>) => C.info,
        bg:    (C: ReturnType<typeof Colors>) => C.infoBg,
    },
};

const INITIAL_STATE: AlertState = {
    visible: false,
    title: '',
    message: undefined,
    buttons: [],
    type: 'info',
};

export default function CustomAlert() {
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    const [state, setState] = useState<AlertState>(INITIAL_STATE);
    const scaleAnim  = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    const show = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
        const resolvedButtons: AlertButton[] =
            buttons && buttons.length > 0 ? buttons : [{ text: 'حسناً', style: 'default' }];

        setState({
            visible: true,
            title,
            message,
            buttons: resolvedButtons,
            type: detectType(title),
        });

        scaleAnim.setValue(0.85);
        opacityAnim.setValue(0);

        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                damping: 18,
                stiffness: 280,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start();
    }, [scaleAnim, opacityAnim]);

    const hide = useCallback((onPress?: () => void) => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 0.88,
                useNativeDriver: true,
                damping: 20,
                stiffness: 300,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setState(INITIAL_STATE);
            onPress?.();
        });
    }, [scaleAnim, opacityAnim]);

    useEffect(() => {
        registerAlertHandler(show);
    }, [show]);

    const { type, title, message, buttons } = state;
    const config = TYPE_CONFIG[type];
    const iconColor = config.color(C);
    const iconBg    = config.bg(C);

    const s = styles(C, isDarkMode);

    return (
        <Modal
            transparent
            visible={state.visible}
            animationType="none"
            statusBarTranslucent
            onRequestClose={() => hide()}
        >
            <Animated.View style={[s.overlay, { opacity: opacityAnim }]}>
                <Animated.View
                    style={[
                        s.card,
                        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
                    ]}
                >
                    {/* Icon */}
                    <View style={[s.iconWrapper, { backgroundColor: iconBg }]}>
                        <Ionicons name={config.icon} size={36} color={iconColor} />
                    </View>

                    {/* Title */}
                    <Text style={s.title}>{title}</Text>

                    {/* Message */}
                    {!!message && (
                        <Text style={s.message}>{message}</Text>
                    )}

                    {/* Divider */}
                    <View style={s.divider} />

                    {/* Buttons */}
                    <View style={[s.buttonsRow, buttons.length === 1 && s.singleButton]}>
                        {buttons.map((btn, idx) => {
                            const isDestructive = btn.style === 'destructive';
                            const isCancel      = btn.style === 'cancel';
                            const isLast        = idx === buttons.length - 1;

                            return (
                                <React.Fragment key={idx}>
                                    {idx > 0 && <View style={s.btnDivider} />}
                                    <TouchableOpacity
                                        style={[
                                            s.btn,
                                            isLast && !isCancel && !isDestructive && s.btnPrimary,
                                            isDestructive && s.btnDestructive,
                                            isCancel && s.btnCancel,
                                        ]}
                                        onPress={() => hide(btn.onPress)}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                s.btnText,
                                                isLast && !isCancel && !isDestructive && s.btnTextPrimary,
                                                isDestructive && s.btnTextDestructive,
                                                isCancel && s.btnTextCancel,
                                            ]}
                                        >
                                            {btn.text}
                                        </Text>
                                    </TouchableOpacity>
                                </React.Fragment>
                            );
                        })}
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = (C: ReturnType<typeof Colors>, isDark: boolean) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 28,
        },
        card: {
            width: '100%',
            maxWidth: 340,
            backgroundColor: C.card,
            borderRadius: 5,
            paddingTop: 28,
            paddingHorizontal: 24,
            paddingBottom: 0,
            alignItems: 'center',
            ...Platform.select({
                ios: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: isDark ? 0.5 : 0.18,
                    shadowRadius: 24,
                },
                android: { elevation: 16 },
            }),
        },
        iconWrapper: {
            width: 72,
            height: 72,
            borderRadius: 5,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
        },
        title: {
            fontSize: 18,
            fontWeight: '700',
            color: C.foreground,
            textAlign: 'center',
            marginBottom: 8,
            lineHeight: 26,
        },
        message: {
            fontSize: 14,
            color: C.mutedForeground,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 4,
            paddingHorizontal: 4,
        },
        divider: {
            width: '120%',
            height: StyleSheet.hairlineWidth,
            backgroundColor: C.border,
            marginTop: 20,
        },
        buttonsRow: {
            flexDirection: 'row-reverse',
            width: '120%',
        },
        singleButton: {
            flexDirection: 'column',
        },
        btn: {
            flex: 1,
            paddingVertical: 15,
            alignItems: 'center',
            justifyContent: 'center',
        },
        btnPrimary: {
            // no extra background — handled by text color
        },
        btnDestructive: {},
        btnCancel: {},
        btnDivider: {
            width: StyleSheet.hairlineWidth,
            backgroundColor: C.border,
        },
        btnText: {
            fontSize: 16,
            fontWeight: '500',
            color: C.primary,
        },
        btnTextPrimary: {
            fontWeight: '700',
            color: C.primary,
        },
        btnTextDestructive: {
            fontWeight: '600',
            color: C.danger,
        },
        btnTextCancel: {
            color: C.mutedForeground,
            fontWeight: '400',
        },
    });
