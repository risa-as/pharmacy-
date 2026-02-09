import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';

interface InventoryItem {
    id: string;
    drugName: string;
    quantity: number;
    price: number;
    reorderLevel: number;
}

export default function InventoryScreen() {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchInventory = async () => {
        try {
            const data = await apiService.getInventory();
            setItems(data);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchInventory();
        setRefreshing(false);
    };

    useEffect(() => {
        fetchInventory();
    }, []);

    const filteredItems = items.filter(item =>
        item.drugName.toLowerCase().includes(search.toLowerCase())
    );

    const getStatusColor = (quantity: number, reorderLevel: number) => {
        if (quantity === 0) return '#ef4444';
        if (quantity <= reorderLevel) return '#f59e0b';
        return '#10b981';
    };

    const getStatusLabel = (quantity: number, reorderLevel: number) => {
        if (quantity === 0) return 'نفاد';
        if (quantity <= reorderLevel) return 'منخفض';
        return 'جيد';
    };

    const renderItem = ({ item }: { item: InventoryItem }) => (
        <TouchableOpacity style={styles.itemCard}>
            <View style={styles.itemHeader}>
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(item.quantity, item.reorderLevel)}20` }
                ]}>
                    <Text style={[
                        styles.statusText,
                        { color: getStatusColor(item.quantity, item.reorderLevel) }
                    ]}>
                        {getStatusLabel(item.quantity, item.reorderLevel)}
                    </Text>
                </View>
                <Text style={styles.itemName}>{item.drugName}</Text>
            </View>
            <View style={styles.itemDetails}>
                <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>الكمية</Text>
                    <Text style={[
                        styles.detailValue,
                        { color: getStatusColor(item.quantity, item.reorderLevel) }
                    ]}>
                        {item.quantity}
                    </Text>
                </View>
                <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>السعر</Text>
                    <Text style={styles.detailValue}>{item.price.toFixed(2)}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#9ca3af" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="ابحث عن دواء..."
                    placeholderTextColor="#9ca3af"
                    value={search}
                    onChangeText={setSearch}
                    textAlign="right"
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Stats */}
            <View style={styles.stats}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{items.length}</Text>
                    <Text style={styles.statLabel}>إجمالي الأصناف</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={[styles.statNumber, { color: '#f59e0b' }]}>
                        {items.filter(i => i.quantity <= i.reorderLevel && i.quantity > 0).length}
                    </Text>
                    <Text style={styles.statLabel}>مخزون منخفض</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={[styles.statNumber, { color: '#ef4444' }]}>
                        {items.filter(i => i.quantity === 0).length}
                    </Text>
                    <Text style={styles.statLabel}>نفاد المخزون</Text>
                </View>
            </View>

            {/* List */}
            <FlatList
                data={filteredItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="cube-outline" size={48} color="#d1d5db" />
                        <Text style={styles.emptyText}>
                            {loading ? 'جارٍ التحميل...' : 'لا توجد أصناف'}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    searchContainer: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: '#fff',
        margin: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        height: 48,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#1f2937',
        marginRight: 12,
    },
    stats: {
        flexDirection: 'row-reverse',
        paddingHorizontal: 16,
        marginBottom: 8,
        gap: 12,
    },
    statItem: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    statLabel: {
        fontSize: 11,
        color: '#6b7280',
        marginTop: 4,
    },
    list: {
        padding: 16,
        paddingTop: 8,
    },
    itemCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    itemHeader: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    itemName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937',
        flex: 1,
        textAlign: 'right',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    itemDetails: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-around',
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        paddingTop: 12,
    },
    detailItem: {
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 12,
        color: '#9ca3af',
        marginBottom: 4,
    },
    detailValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: '#9ca3af',
        marginTop: 12,
        fontSize: 14,
    },
});
