import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';

interface Stats {
    sales: number;
    inventory: number;
    lowStock: number;
    expiring: number;
}

export default function HomeScreen() {
    const [stats, setStats] = useState<Stats>({
        sales: 0,
        inventory: 0,
        lowStock: 0,
        expiring: 0,
    });
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const data = await apiService.getStats();
            setStats(data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchStats();
        setRefreshing(false);
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const statCards = [
        { label: 'مبيعات اليوم', value: stats.sales, icon: 'cart', color: '#10b981' },
        { label: 'المخزون', value: stats.inventory, icon: 'cube', color: '#3b82f6' },
        { label: 'نقص المخزون', value: stats.lowStock, icon: 'warning', color: '#f59e0b' },
        { label: 'قارب انتهاء الصلاحية', value: stats.expiring, icon: 'time', color: '#ef4444' },
    ];

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.greeting}>مرحباً بك 👋</Text>
                <Text style={styles.title}>لوحة التحكم</Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
                {statCards.map((card, index) => (
                    <View key={index} style={styles.statCard}>
                        <View style={[styles.statIcon, { backgroundColor: `${card.color}20` }]}>
                            <Ionicons name={card.icon as any} size={24} color={card.color} />
                        </View>
                        <Text style={styles.statValue}>{loading ? '-' : card.value}</Text>
                        <Text style={styles.statLabel}>{card.label}</Text>
                    </View>
                ))}
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
                <View style={styles.actionsGrid}>
                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: '#dbeafe' }]}>
                            <Ionicons name="barcode-outline" size={28} color="#2563eb" />
                        </View>
                        <Text style={styles.actionLabel}>مسح الباركود</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: '#dcfce7' }]}>
                            <Ionicons name="add-circle-outline" size={28} color="#16a34a" />
                        </View>
                        <Text style={styles.actionLabel}>بيع جديد</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton}>
                        <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                            <Ionicons name="notifications-outline" size={28} color="#d97706" />
                        </View>
                        <Text style={styles.actionLabel}>التنبيهات</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Recent Sales */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>آخر المبيعات</Text>
                <View style={styles.emptyState}>
                    <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
                    <Text style={styles.emptyText}>لا توجد مبيعات حديثة</Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    header: {
        padding: 20,
        backgroundColor: '#2563eb',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    greeting: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'right',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'right',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
        marginTop: -20,
        gap: 12,
    },
    statCard: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        alignItems: 'flex-end',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    statIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    statValue: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    statLabel: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 4,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 16,
        textAlign: 'right',
    },
    actionsGrid: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    actionIcon: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 12,
        color: '#4b5563',
        fontWeight: '600',
    },
    emptyState: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#9ca3af',
        marginTop: 12,
        fontSize: 14,
    },
});
