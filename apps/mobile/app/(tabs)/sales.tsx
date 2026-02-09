import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    TextInput,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function SalesScreen() {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [barcode, setBarcode] = useState('');

    const addToCart = (item: Omit<CartItem, 'quantity'>) => {
        const existingItem = cart.find(i => i.id === item.id);
        if (existingItem) {
            setCart(cart.map(i =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            setCart([...cart, { ...item, quantity: 1 }]);
        }
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(i => i.id !== id));
    };

    const updateQuantity = (id: string, change: number) => {
        setCart(cart.map(item => {
            if (item.id === id) {
                const newQuantity = item.quantity + change;
                if (newQuantity <= 0) return item;
                return { ...item, quantity: newQuantity };
            }
            return item;
        }));
    };

    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    const handleCheckout = () => {
        if (cart.length === 0) {
            Alert.alert('تنبيه', 'السلة فارغة');
            return;
        }
        Alert.alert(
            'تأكيد البيع',
            `المجموع: ${total.toFixed(2)}\nهل تريد إتمام البيع؟`,
            [
                { text: 'إلغاء', style: 'cancel' },
                {
                    text: 'تأكيد', onPress: () => {
                        Alert.alert('نجاح', 'تم إتمام البيع بنجاح');
                        setCart([]);
                    }
                },
            ]
        );
    };

    const handleScanBarcode = () => {
        // Simulated barcode scan
        addToCart({
            id: Date.now().toString(),
            name: `دواء #${Math.floor(Math.random() * 1000)}`,
            price: parseFloat((Math.random() * 50 + 5).toFixed(2)),
        });
    };

    const renderCartItem = ({ item }: { item: CartItem }) => (
        <View style={styles.cartItem}>
            <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFromCart(item.id)}
            >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>

            <View style={styles.quantityControls}>
                <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item.id, 1)}
                >
                    <Ionicons name="add" size={18} color="#2563eb" />
                </TouchableOpacity>
                <Text style={styles.quantityText}>{item.quantity}</Text>
                <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item.id, -1)}
                >
                    <Ionicons name="remove" size={18} color="#2563eb" />
                </TouchableOpacity>
            </View>

            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{item.price.toFixed(2)}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Barcode Scanner Button */}
            <TouchableOpacity style={styles.scanButton} onPress={handleScanBarcode}>
                <Ionicons name="barcode-outline" size={24} color="#fff" />
                <Text style={styles.scanButtonText}>مسح الباركود</Text>
            </TouchableOpacity>

            {/* Manual Input */}
            <View style={styles.manualInput}>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                        if (barcode) {
                            addToCart({
                                id: barcode,
                                name: `دواء ${barcode}`,
                                price: 10.00,
                            });
                            setBarcode('');
                        }
                    }}
                >
                    <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
                <TextInput
                    style={styles.barcodeInput}
                    placeholder="أدخل الباركود يدوياً"
                    placeholderTextColor="#9ca3af"
                    value={barcode}
                    onChangeText={setBarcode}
                    textAlign="right"
                    keyboardType="numeric"
                />
            </View>

            {/* Cart */}
            <View style={styles.cartHeader}>
                <Text style={styles.cartCount}>({cart.length})</Text>
                <Text style={styles.cartTitle}>السلة</Text>
            </View>

            <FlatList
                data={cart}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id}
                style={styles.cartList}
                ListEmptyComponent={
                    <View style={styles.emptyCart}>
                        <Ionicons name="cart-outline" size={48} color="#d1d5db" />
                        <Text style={styles.emptyText}>السلة فارغة</Text>
                    </View>
                }
            />

            {/* Total & Checkout */}
            <View style={styles.footer}>
                <View style={styles.totalRow}>
                    <Text style={styles.totalAmount}>{total.toFixed(2)}</Text>
                    <Text style={styles.totalLabel}>المجموع</Text>
                </View>
                <TouchableOpacity
                    style={[styles.checkoutButton, cart.length === 0 && styles.checkoutDisabled]}
                    onPress={handleCheckout}
                    disabled={cart.length === 0}
                >
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.checkoutText}>إتمام البيع</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    scanButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#2563eb',
        margin: 16,
        padding: 16,
        borderRadius: 16,
    },
    scanButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    manualInput: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 16,
        gap: 8,
    },
    barcodeInput: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: '#1f2937',
    },
    addButton: {
        backgroundColor: '#10b981',
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cartHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 8,
        gap: 8,
    },
    cartTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    cartCount: {
        fontSize: 14,
        color: '#6b7280',
    },
    cartList: {
        flex: 1,
        paddingHorizontal: 16,
    },
    cartItem: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    itemInfo: {
        flex: 1,
        alignItems: 'flex-end',
    },
    itemName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1f2937',
    },
    itemPrice: {
        fontSize: 13,
        color: '#10b981',
        marginTop: 2,
    },
    quantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        marginHorizontal: 12,
    },
    quantityButton: {
        padding: 8,
    },
    quantityText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937',
        minWidth: 30,
        textAlign: 'center',
    },
    removeButton: {
        padding: 8,
    },
    emptyCart: {
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyText: {
        color: '#9ca3af',
        marginTop: 12,
    },
    footer: {
        backgroundColor: '#fff',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    totalRow: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    totalLabel: {
        fontSize: 16,
        color: '#6b7280',
    },
    totalAmount: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    checkoutButton: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#10b981',
        borderRadius: 12,
        padding: 16,
    },
    checkoutDisabled: {
        backgroundColor: '#d1d5db',
    },
    checkoutText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
