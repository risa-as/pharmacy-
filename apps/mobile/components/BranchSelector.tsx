import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { apiService } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';

interface Branch {
    id: string;
    name: string;
}

interface BranchSelectorProps {
    selectedBranchId: string | null;
    onSelectBranch: (branchId: string | null) => void;
}

export const BranchSelector = ({ selectedBranchId, onSelectBranch }: BranchSelectorProps) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const { isDarkMode } = useTheme();
    const C = Colors(isDarkMode);

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const data = await apiService.getBranches();
                setBranches(data);
            } catch (error) {
                console.error('Failed to fetch branches', error);
            } finally {
                setLoading(false);
            }
        };
        fetchBranches();
    }, []);

    const selectedBranch = selectedBranchId ? branches.find(b => b.id === selectedBranchId) : null;
    const selectedLabel = selectedBranch ? selectedBranch.name : 'الكل';

    if (loading) {
        return (
            <View style={{ height: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <ActivityIndicator size="small" color={C.primary} />
            </View>
        );
    }

    const options = [{ id: null as string | null, name: 'الكل' }, ...branches];

    return (
        <View style={{ marginBottom: 16, alignSelf: 'flex-end' }}>
            <TouchableOpacity
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: C.card,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: C.border,
                    gap: 8,
                }}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.7}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="business" size={20} color={C.mutedForeground} />
                    <Text style={{ fontSize: 16, color: C.foreground, fontWeight: '500' }}>
                        الفرع: {selectedLabel}
                    </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color={C.mutedForeground} />
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}
                    activeOpacity={1}
                    onPress={() => setModalVisible(false)}
                >
                    <View style={{
                        backgroundColor: C.card,
                        borderRadius: 20,
                        padding: 20,
                        maxHeight: '60%',
                        borderWidth: 1,
                        borderColor: C.border,
                    }}>
                        {/* Header */}
                        <View style={{
                            flexDirection: 'row-reverse',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 16,
                            paddingBottom: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: C.border,
                        }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: C.foreground }}>اختر الفرع</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color={C.mutedForeground} />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={options}
                            keyExtractor={item => item.id ?? 'all'}
                            renderItem={({ item }) => {
                                const isSelected = selectedBranchId === (item.id ?? null);
                                return (
                                    <TouchableOpacity
                                        style={{
                                            flexDirection: 'row-reverse',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            paddingVertical: 14,
                                            paddingHorizontal: 12,
                                            borderRadius: 12,
                                            marginBottom: 8,
                                            backgroundColor: isSelected ? C.primaryMuted : 'transparent',
                                        }}
                                        onPress={() => {
                                            onSelectBranch(item.id ?? null);
                                            setModalVisible(false);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={{
                                            fontSize: 16,
                                            fontWeight: isSelected ? '700' : '500',
                                            color: isSelected ? C.primary : C.foreground,
                                        }}>
                                            {item.name}
                                        </Text>
                                        {isSelected && (
                                            <Ionicons name="checkmark-circle" size={20} color={C.primary} />
                                        )}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

export default BranchSelector;
