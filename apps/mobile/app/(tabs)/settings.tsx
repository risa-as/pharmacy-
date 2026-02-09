import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../../services/auth';

export default function SettingsScreen() {
    const handleLogout = () => {
        Alert.alert(
            'تسجيل الخروج',
            'هل أنت متأكد من تسجيل الخروج؟',
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'خروج',
                    style: 'destructive',
                    onPress: async () => {
                        await authService.logout();
                        router.replace('/login');
                    },
                },
            ]
        );
    };

    const menuItems = [
        {
            title: 'الحساب',
            icon: 'person-outline',
            items: [
                { label: 'معلومات الحساب', icon: 'person-circle-outline', onPress: () => { } },
                { label: 'تغيير كلمة المرور', icon: 'key-outline', onPress: () => { } },
            ],
        },
        {
            title: 'التطبيق',
            icon: 'settings-outline',
            items: [
                { label: 'الإشعارات', icon: 'notifications-outline', onPress: () => { } },
                { label: 'اللغة', icon: 'language-outline', onPress: () => { } },
                { label: 'المظهر', icon: 'moon-outline', onPress: () => { } },
            ],
        },
        {
            title: 'المساعدة',
            icon: 'help-circle-outline',
            items: [
                { label: 'الدعم الفني', icon: 'headset-outline', onPress: () => { } },
                { label: 'حول التطبيق', icon: 'information-circle-outline', onPress: () => { } },
            ],
        },
    ];

    return (
        <ScrollView style={styles.container}>
            {/* User Card */}
            <View style={styles.userCard}>
                <View style={styles.userAvatar}>
                    <Ionicons name="person" size={32} color="#2563eb" />
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.userName}>المستخدم</Text>
                    <Text style={styles.userEmail}>user@faramace.com</Text>
                </View>
            </View>

            {/* Menu Sections */}
            {menuItems.map((section, sectionIndex) => (
                <View key={sectionIndex} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Ionicons name={section.icon as any} size={18} color="#6b7280" />
                    </View>
                    <View style={styles.menuGroup}>
                        {section.items.map((item, itemIndex) => (
                            <TouchableOpacity
                                key={itemIndex}
                                style={[
                                    styles.menuItem,
                                    itemIndex < section.items.length - 1 && styles.menuItemBorder,
                                ]}
                                onPress={item.onPress}
                            >
                                <Ionicons name="chevron-back" size={20} color="#d1d5db" />
                                <View style={styles.menuItemContent}>
                                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                                    <View style={styles.menuItemIcon}>
                                        <Ionicons name={item.icon as any} size={20} color="#6b7280" />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            ))}

            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                <Text style={styles.logoutText}>تسجيل الخروج</Text>
            </TouchableOpacity>

            {/* Version */}
            <Text style={styles.version}>الإصدار 1.0.0</Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    userCard: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: '#fff',
        margin: 16,
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    userAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#dbeafe',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        marginRight: 16,
        alignItems: 'flex-end',
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    userEmail: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 4,
    },
    section: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    menuGroup: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        padding: 16,
    },
    menuItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    menuItemContent: {
        flex: 1,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 12,
    },
    menuItemIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuItemLabel: {
        fontSize: 16,
        color: '#1f2937',
    },
    logoutButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#fef2f2',
        marginHorizontal: 16,
        padding: 16,
        borderRadius: 16,
        marginTop: 8,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ef4444',
    },
    version: {
        textAlign: 'center',
        color: '#9ca3af',
        fontSize: 12,
        marginVertical: 24,
    },
});
