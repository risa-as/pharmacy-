import React, { useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, Modal, FlatList,
    ActivityIndicator, ScrollView,
} from 'react-native';
import { apiService } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { managerPalette } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';

interface Branch {
    id: string;
    name: string;
}

interface BranchSelectorProps {
    selectedBranchId: string | null;
    onSelectBranch: (branchId: string | null) => void;
    /** When true, renders nothing if only one branch exists (filter is meaningless). */
    hideIfSingle?: boolean;
    /** Override the accent colour for the selected state (defaults to theme primary). */
    accent?: string;
    /** Override the muted accent colour (defaults to theme primaryMuted). */
    accentMuted?: string;
}

const ALL_OPTION: { id: string | null; name: string } = { id: null, name: 'الكل' };
const PILL_THRESHOLD = 6; // show pills for ≤ this many branches (incl. "الكل")

export const BranchSelector = ({ selectedBranchId, onSelectBranch, hideIfSingle, accent, accentMuted }: BranchSelectorProps) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const { isDarkMode } = useTheme();
    const C = managerPalette(isDarkMode);
    const primary = accent ?? C.primary;
    const primaryMuted = accentMuted ?? C.primaryMuted;

    useEffect(() => {
        apiService.getBranches()
            .then(setBranches)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Hide entirely when single-branch and caller opts in
    if (hideIfSingle && !loading && branches.length <= 1) return null;

    const selectedBranch = selectedBranchId ? branches.find(b => b.id === selectedBranchId) : null;
    const selectedLabel = selectedBranch?.name ?? 'الكل';
    const options = [ALL_OPTION as unknown as Branch, ...branches];
    const usePills = options.length <= PILL_THRESHOLD;

    if (loading) {
        if (hideIfSingle) return null; // avoid flicker before we know the count
        return (
            <View style={{ height: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <ActivityIndicator size="small" color={primary} />
            </View>
        );
    }

    // ── Pill mode (≤ PILL_THRESHOLD options) ──────────────────────────────────
    if (usePills) {
        return (
            <View style={{ marginBottom: 20 }}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 2 }}
                >
                    {options.map((option) => {
                        const isSelected = (option.id ?? null) === selectedBranchId;
                        return (
                            <TouchableOpacity
                                key={option.id ?? 'all'}
                                onPress={() => onSelectBranch(option.id ?? null)}
                                activeOpacity={0.75}
                                style={{
                                    flexDirection: 'row-reverse',
                                    alignItems: 'center',
                                    gap: 6,
                                    paddingHorizontal: 16,
                                    paddingVertical: 9,
                                    borderRadius: 5,
                                    backgroundColor: isSelected ? primary : C.card,
                                    borderWidth: 1.5,
                                    borderColor: isSelected ? primary : C.border,
                                    shadowColor: isSelected ? primary : 'transparent',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.2,
                                    shadowRadius: 4,
                                    elevation: isSelected ? 3 : 0,
                                }}
                            >
                                {option.id === null
                                    ? <Ionicons name="layers" size={14} color={isSelected ? '#fff' : C.mutedForeground} />
                                    : <Ionicons name="business" size={14} color={isSelected ? '#fff' : C.mutedForeground} />
                                }
                                <Text style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? '700' : '500',
                                    color: isSelected ? '#fff' : C.foreground,
                                }}>
                                    {option.name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }

    // ── Dropdown mode (many branches) ─────────────────────────────────────────
    return (
        <View style={{ marginBottom: 20 }}>
            <TouchableOpacity
                style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 5,
                    backgroundColor: selectedBranchId ? primaryMuted : C.card,
                    borderWidth: 1.5,
                    borderColor: selectedBranchId ? primary : C.border,
                }}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.75}
            >
                <Ionicons name="business" size={15} color={selectedBranchId ? primary : C.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: selectedBranchId ? primary : C.foreground }}>
                    {selectedLabel}
                </Text>
                <Ionicons name="chevron-down" size={14} color={selectedBranchId ? primary : C.mutedForeground} />
            </TouchableOpacity>

            {/* Bottom-sheet modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
                    activeOpacity={1}
                    onPress={() => setModalVisible(false)}
                />
                <View style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: C.card,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    paddingHorizontal: 20,
                    paddingBottom: 40,
                    maxHeight: '65%',
                    borderTopWidth: 1,
                    borderColor: C.border,
                }}>
                    {/* Handle */}
                    <View style={{ width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 }} />

                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: C.foreground }}>اختر الفرع</Text>
                        <TouchableOpacity
                            onPress={() => setModalVisible(false)}
                            style={{ backgroundColor: C.border, borderRadius: 5, padding: 6 }}
                        >
                            <Ionicons name="close" size={18} color={C.mutedForeground} />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={options}
                        keyExtractor={item => item.id ?? 'all'}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => {
                            const isSelected = selectedBranchId === (item.id ?? null);
                            return (
                                <TouchableOpacity
                                    style={{
                                        flexDirection: 'row-reverse',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        paddingVertical: 14,
                                        paddingHorizontal: 16,
                                        borderRadius: 14,
                                        marginBottom: 6,
                                        backgroundColor: isSelected ? primaryMuted : 'transparent',
                                        borderWidth: 1.5,
                                        borderColor: isSelected ? primary : 'transparent',
                                    }}
                                    onPress={() => { onSelectBranch(item.id ?? null); setModalVisible(false); }}
                                    activeOpacity={0.7}
                                >
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                                        <View style={{
                                            backgroundColor: isSelected ? primary : C.border,
                                            borderRadius: 8,
                                            padding: 7,
                                        }}>
                                            <Ionicons
                                                name={item.id === null ? 'layers' : 'business'}
                                                size={16}
                                                color={isSelected ? '#fff' : C.mutedForeground}
                                            />
                                        </View>
                                        <Text style={{ fontSize: 15, fontWeight: isSelected ? '700' : '500', color: isSelected ? primary : C.foreground }}>
                                            {item.name}
                                        </Text>
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={primary} />}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </Modal>
        </View>
    );
};

export default BranchSelector;
