import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { Radius } from '../constants/colors';
import { usePalette } from './ui/Kit';

interface Branch {
    id: string;
    name: string;
}

interface BranchSelectorProps {
    selectedBranchId: string | null;
    onSelectBranch: (branchId: string | null) => void;
    /** When true, renders nothing if only one branch exists (filter is meaningless). */
    hideIfSingle?: boolean;
    /** Keep the branch visible while preventing changes during an operation. */
    disabled?: boolean;
    /** Offer «كل الفروع» (null). Disable where a concrete branch is required. */
    allowAll?: boolean;
    /** Field label shown beside/above the dropdown. */
    label?: string;
    /** Inline layout: label on the right, dropdown filling the row. */
    inline?: boolean;
    /** @deprecated kept for older call sites — the dropdown uses the theme. */
    accent?: string;
    /** @deprecated kept for older call sites — the dropdown uses the theme. */
    accentMuted?: string;
}

export const ALL_BRANCHES_LABEL = 'كل الفروع';

/**
 * Branch dropdown (design rule: «الفرع اختيار من قائمة»). Includes «كل الفروع»
 * plus the branches the server returns for this user; the parent owns the
 * selection so it survives navigating back (navigation-map §7).
 */
export const BranchSelector = ({ selectedBranchId, onSelectBranch, hideIfSingle, allowAll = true, label = 'الفرع', inline, disabled = false }: BranchSelectorProps) => {
    const C = usePalette();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        apiService.getBranches()
            .then(list => setBranches(Array.isArray(list) ? list : []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (hideIfSingle && (loading || branches.length <= 1)) return null;

    const options: Array<{ id: string | null; name: string }> = [
        ...(allowAll ? [{ id: null, name: ALL_BRANCHES_LABEL }] : []),
        ...branches,
    ];
    const selectedLabel = selectedBranchId
        ? branches.find(b => b.id === selectedBranchId)?.name ?? '—'
        : allowAll ? ALL_BRANCHES_LABEL : 'اختر الفرع';

    const trigger = (
        <TouchableOpacity
            onPress={() => setOpen(true)}
            disabled={disabled}
            accessibilityState={{ disabled }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${selectedLabel}`}
            style={{
                flex: inline ? 1 : undefined,
                flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.control,
                paddingHorizontal: 14, paddingVertical: 12,
            }}
        >
            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{selectedLabel}</Text>
            {loading ? <ActivityIndicator size="small" color={C.primary} /> : !disabled && <Ionicons name="chevron-down" size={18} color={C.mutedForeground} />}
        </TouchableOpacity>
    );

    return (
        <>
            {inline ? (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 14 }}>{label}</Text>
                    {trigger}
                </View>
            ) : (
                <View style={{ gap: 6 }}>
                    <Text style={{ color: C.mutedForeground, fontSize: 13, textAlign: 'right' }}>{label}</Text>
                    {trigger}
                </View>
            )}

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={() => setOpen(false)} />
                <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '65%',
                    backgroundColor: C.card, borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card,
                    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32,
                }}>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '800' }}>اختر الفرع</Text>
                        <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="إغلاق">
                            <Ionicons name="close" size={24} color={C.mutedForeground} />
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={options}
                        keyExtractor={item => item.id ?? 'all'}
                        renderItem={({ item, index }) => {
                            const selected = (item.id ?? null) === selectedBranchId;
                            return (
                                <TouchableOpacity
                                    onPress={() => { onSelectBranch(item.id); setOpen(false); }}
                                    activeOpacity={0.75}
                                    style={{
                                        flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
                                        paddingVertical: 14, paddingHorizontal: 6,
                                        borderTopWidth: index === 0 ? 0 : 1, borderTopColor: C.border,
                                    }}
                                >
                                    <Text style={{ color: selected ? C.primary : C.foreground, fontSize: 15, fontWeight: selected ? '800' : '500' }}>{item.name}</Text>
                                    {selected && <Ionicons name="checkmark" size={20} color={C.primary} />}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </Modal>
        </>
    );
};

export default BranchSelector;
