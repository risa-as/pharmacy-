import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { apiService } from "../../services/api";
import { dbService } from "../../services/db";
import { syncService } from "../../services/sync";
import { printerService } from "../../services/printer";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Colors } from "../../constants/colors";

interface CartItem {
  id: string;
  tradeName?: string;
  name: string;
  price: number;
  quantity: number;
  stock?: number;
  scientificName?: string;
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  balance?: number;
}

// ── Cart Row ────────────────────────────────────────────────────────────────────
const CartItemRow = React.memo(
  ({
    item,
    C,
    onUpdateQuantity,
    onRemove,
  }: {
    item: CartItem;
    C: ReturnType<typeof Colors>;
    onUpdateQuantity: (id: string, change: number) => void;
    onRemove: (id: string) => void;
  }) => (
    <View
      style={{
        flexDirection: "row-reverse",
        alignItems: "center",
        paddingVertical: 11,
        paddingHorizontal: 14,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
      }}
    >
      {/* Drug icon */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 5,
          backgroundColor: C.primaryMuted,
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name="medical" size={18} color={C.primary} />
      </View>

      {/* Drug info */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: C.foreground,
            fontWeight: "700",
            fontSize: 13,
            textAlign: "right",
          }}
          numberOfLines={1}
        >
          {item.tradeName ?? item.name}
        </Text>
        <Text
          style={{
            color: C.success,
            fontSize: 12,
            textAlign: "right",
            marginTop: 1,
          }}
        >
          {item.price.toLocaleString("en-US")} د.ع
        </Text>
        {item.stock !== undefined && item.stock <= 5 && (
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 3,
              marginTop: 1,
            }}
          >
            <Ionicons name="warning-outline" size={10} color={C.warning} />
            <Text style={{ color: C.warning, fontSize: 10 }}>
              متبقي {item.stock}
            </Text>
          </View>
        )}
      </View>

      {/* Qty controls */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: C.input,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: C.border,
          overflow: "hidden",
        }}
      >
        <TouchableOpacity
          onPress={() => onUpdateQuantity(item.id, -1)}
          style={{ padding: 7 }}
        >
          <Ionicons name="remove" size={15} color={C.danger} />
        </TouchableOpacity>
        <Text
          style={{
            color: C.foreground,
            fontWeight: "800",
            minWidth: 26,
            textAlign: "center",
            fontSize: 14,
          }}
        >
          {item.quantity}
        </Text>
        <TouchableOpacity
          onPress={() => onUpdateQuantity(item.id, 1)}
          style={{ padding: 7 }}
        >
          <Ionicons name="add" size={15} color={C.success} />
        </TouchableOpacity>
      </View>

      {/* Line total + remove */}
      <View style={{ alignItems: "flex-end", gap: 6, minWidth: 54 }}>
        <Text style={{ color: C.foreground, fontWeight: "800", fontSize: 13 }}>
          {(item.price * item.quantity).toLocaleString("en-US")}
        </Text>
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="trash-outline" size={15} color={C.danger} />
        </TouchableOpacity>
      </View>
    </View>
  ),
);

// ── Main screen ─────────────────────────────────────────────────────────────────
export default function SalesScreen() {
  const { isDarkMode } = useTheme();
  const { branchId } = useAuth();
  const C = Colors(isDarkMode);
  const params = useLocalSearchParams();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);

  const [interactions, setInteractions] = useState<
    Array<{
      drug1: string;
      drug2: string;
      severity: string;
      description: string;
    }>
  >([]);
  const [allergyWarnings, setAllergyWarnings] = useState<string[]>([]);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);

  const [manualDiscount, setManualDiscount] = useState(0);
  const [manualDiscountInput, setManualDiscountInput] = useState("");
  const [loyaltySettings, setLoyaltySettings] = useState<{
    loyaltyEnabled: boolean;
    loyaltyPointsPerDinar: number;
    loyaltyRedemptionValue: number;
    loyaltyMinRedemption: number;
  } | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<{
    totalPoints: number;
    tier: string;
  } | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const [recentItems, setRecentItems] = useState<CartItem[]>([]);
  const [loadingRecentId, setLoadingRecentId] = useState<string | null>(null);

  // Name search
  const [nameResults, setNameResults] = useState<any[]>([]);
  const [searchingName, setSearchingName] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
  const notFoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiService
      .getLoyaltySettings()
      .then(setLoyaltySettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoyaltyAccount(null);
    setPointsToRedeem(0);
    if (!selectedPatient) return;
    apiService
      .getLoyaltyAccount(selectedPatient.id)
      .then(setLoyaltyAccount)
      .catch(() => {});
  }, [selectedPatient]);

  useEffect(() => {
    if (params.scannedBarcode) {
      handleBarcodeAdd(params.scannedBarcode as string);
      router.setParams({ scannedBarcode: "" });
    }
  }, [params.scannedBarcode]);

  useEffect(() => {
    if (patientQuery.length < 2) {
      setPatientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingPatient(true);
      try {
        const results = await apiService.searchPatients(patientQuery);
        setPatientResults(results ?? []);
      } finally {
        setSearchingPatient(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [patientQuery]);

  // Live name search while typing (only when input has letters)
  useEffect(() => {
    const hasLetters = /[a-zA-Z؀-ۿ]/.test(barcode);
    if (!hasLetters || barcode.trim().length < 2) {
      setNameResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingName(true);
      try {
        const results = await apiService.searchDrugByName(
          barcode.trim(),
          branchId ?? undefined,
        );
        setNameResults(results);
      } finally {
        setSearchingName(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [barcode, branchId]);

  const showNotFound = useCallback((msg: string) => {
    if (notFoundTimer.current) clearTimeout(notFoundTimer.current);
    setNotFoundMsg(msg);
    notFoundTimer.current = setTimeout(() => setNotFoundMsg(null), 3500);
  }, []);

  const handleBarcodeAdd = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      const isBarcode = /^[\d\-]+$/.test(trimmed); // digits only → treat as barcode

      setLoading(true);
      setNameResults([]);
      try {
        if (isBarcode) {
          // Barcode lookup
          const drug = await apiService.getDrugByBarcode(
            trimmed,
            branchId ?? undefined,
          );
          if (!drug) {
            showNotFound("لم يُعثر على باركود مطابق في المخزون");
            return;
          }
          addToCart(drug);
          setBarcode("");
        } else {
          // Name search
          setSearchingName(true);
          const results = await apiService.searchDrugByName(
            trimmed,
            branchId ?? undefined,
          );
          setSearchingName(false);
          if (results.length === 0) {
            showNotFound(`لا يوجد دواء باسم "${trimmed}" في المخزون`);
            return;
          }
          if (results.length === 1) {
            // Single match → add directly
            addToCart(results[0]);
            setBarcode("");
          } else {
            // Multiple matches → show dropdown for user to pick
            setNameResults(results);
          }
        }
      } finally {
        setLoading(false);
        setSearchingName(false);
      }
    },
    [branchId, addToCart, showNotFound],
  );

  const addToCart = useCallback(
    (drug: any) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.id === drug.id);
        if (existing) {
          if (
            drug.quantity !== undefined &&
            existing.quantity >= drug.quantity
          ) {
            Alert.alert("تنبيه", `الكمية المتوفرة فقط ${drug.quantity}`);
            return prev;
          }
          return prev.map((i) =>
            i.id === drug.id ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }
        if (drug.quantity !== undefined && drug.quantity <= 0) {
          Alert.alert("نفاد المخزون", "هذا الدواء غير متوفر حالياً في المخزون");
          return prev;
        }
        return [
          ...prev,
          {
            id: drug.id,
            name: drug.name,
            tradeName: drug.tradeName,
            price: drug.price,
            quantity: 1,
            stock: drug.quantity,
            scientificName: drug.scientificName,
          },
        ];
      });
      const allNames = cart
        .map((i) => i.scientificName ?? i.name)
        .concat(drug.scientificName ?? drug.name);
      if (allNames.length > 1) {
        apiService
          .checkPharmacovigilance(allNames, selectedPatient?.id)
          .then((result) => {
            if (result?.interactions) setInteractions(result.interactions);
            if (result?.allergyWarnings)
              setAllergyWarnings(result.allergyWarnings);
          })
          .catch(() => {});
      }
    },
    [cart, selectedPatient],
  );

  const handleSelectNameResult = useCallback(
    (drug: any) => {
      addToCart(drug);
      setNameResults([]);
      setBarcode("");
    },
    [addToCart],
  );

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (notFoundTimer.current) clearTimeout(notFoundTimer.current);
    },
    [],
  );

  const handleRecentItemPress = useCallback(
    async (item: CartItem) => {
      if (loadingRecentId === item.id) return;
      setLoadingRecentId(item.id);
      try {
        const currentStock = await apiService.getDrugCurrentStock(
          item.id,
          branchId ?? undefined,
        );
        if (currentStock !== null && currentStock <= 0) {
          setRecentItems((prev) => prev.filter((r) => r.id !== item.id));
          Alert.alert("نفاد المخزون", "هذا الدواء غير متوفر حالياً في المخزون");
          return;
        }
        const stockToUse = currentStock ?? Math.max(0, (item.stock ?? 0) - 1);
        if (stockToUse <= 0) {
          setRecentItems((prev) => prev.filter((r) => r.id !== item.id));
          Alert.alert("نفاد المخزون", "هذا الدواء غير متوفر حالياً في المخزون");
          return;
        }
        addToCart({ ...item, quantity: stockToUse });
      } finally {
        setLoadingRecentId(null);
      }
    },
    [branchId, addToCart, loadingRecentId],
  );

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, change: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = item.quantity + change;
        if (next <= 0) return item;
        if (item.stock !== undefined && next > item.stock) {
          Alert.alert("تنبيه", `الكمية المتوفرة فقط ${item.stock}`);
          return item;
        }
        return { ...item, quantity: next };
      }),
    );
  }, []);

  const subTotal = useMemo(
    () => cart.reduce((acc, i) => acc + i.price * i.quantity, 0),
    [cart],
  );
  const itemCount = useMemo(
    () => cart.reduce((acc, i) => acc + i.quantity, 0),
    [cart],
  );

  const redemptionValue = loyaltySettings?.loyaltyRedemptionValue ?? 2.5;
  const minRedemption = loyaltySettings?.loyaltyMinRedemption ?? 500;
  const loyaltyDiscount = Math.floor(pointsToRedeem * redemptionValue);
  const totalDiscount = manualDiscount + loyaltyDiscount;
  const total = Math.max(0, subTotal - totalDiscount);

  const resetCart = useCallback(() => {
    setCart([]);
    setSelectedPatient(null);
    setInteractions([]);
    setAllergyWarnings([]);
    setManualDiscount(0);
    setManualDiscountInput("");
    setPointsToRedeem(0);
    setLoyaltyAccount(null);
    setNameResults([]);
    setNotFoundMsg(null);
    setBarcode("");
  }, []);

  const handleCheckout = useCallback(
    (method: "CASH" | "CREDIT") => {
      if (cart.length === 0) {
        Alert.alert("تنبيه", "السلة فارغة");
        return;
      }
      if (method === "CREDIT" && !selectedPatient) {
        Alert.alert("تنبيه", "يجب اختيار عميل للبيع الآجل", [
          { text: "اختيار عميل", onPress: () => setShowPatientModal(true) },
          { text: "إلغاء" },
        ]);
        return;
      }
      const discountLine =
        totalDiscount > 0 ? `\nخصم: ${totalDiscount.toLocaleString()} د.ع` : "";
      Alert.alert(
        "تأكيد البيع",
        `الإجمالي: ${total.toLocaleString()} د.ع${discountLine}\nطريقة الدفع: ${method === "CASH" ? "نقدي" : "آجل"}${selectedPatient ? `\nالعميل: ${selectedPatient.name}` : ""}`,
        [
          { text: "إلغاء", style: "cancel" },
          { text: "تأكيد", onPress: () => processSale(method) },
        ],
      );
    },
    [cart, selectedPatient, total, totalDiscount],
  );

  const processSale = async (method: "CASH" | "CREDIT") => {
    setLoading(true);
    if (pointsToRedeem > 0 && selectedPatient) {
      try {
        await apiService.redeemLoyaltyPoints(
          selectedPatient.id,
          pointsToRedeem,
        );
      } catch {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("خطأ", "فشل استبدال نقاط الولاء. تحقق من الاتصال.");
        setLoading(false);
        return;
      }
    }
    const saleData = {
      items: cart.map((i) => ({
        drugId: i.id,
        quantity: i.quantity,
        price: i.price,
      })),
      totalAmount: total,
      patientId: selectedPatient?.id,
      paymentMethod: method,
      discount: totalDiscount,
      branchId: branchId ?? undefined,
    };
    if (method === "CREDIT") {
      const online = await syncService.isOnline();
      if (!online) {
        Alert.alert("تنبيه", "البيع الآجل غير متاح بدون اتصال");
        setLoading(false);
        return;
      }
      try {
        await apiService.createSale(saleData);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        const creditCartSnapshot = [...cart];
        const creditTotalSnapshot = total;
        setRecentItems((prev) => {
          const soldMap = new Map(
            creditCartSnapshot.map((i) => [i.id, i.quantity]),
          );
          const updatedPrev = prev
            .map((r) => {
              const soldQty = soldMap.get(r.id) ?? 0;
              return { ...r, stock: Math.max(0, (r.stock ?? 0) - soldQty) };
            })
            .filter((r) => (r.stock ?? 0) > 0);
          const newItems = creditCartSnapshot
            .map((i) => ({
              ...i,
              stock: Math.max(0, (i.stock ?? 0) - i.quantity),
              quantity: 1,
            }))
            .filter((i) => (i.stock ?? 0) > 0)
            .slice(0, 5);
          const seen = new Set<string>();
          return [...newItems, ...updatedPrev]
            .filter((i) => {
              if (seen.has(i.id)) return false;
              seen.add(i.id);
              return true;
            })
            .slice(0, 5);
        });
        resetCart();
        Alert.alert("تمت العملية", "تمت عملية البيع", [
          {
            text: "طباعة",
            onPress: () =>
              printReceipt(creditCartSnapshot, creditTotalSnapshot),
          },
          { text: "موافق" },
        ]);
      } catch {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "خطأ",
          "فشل إتمام البيع الآجل. تحقق من الاتصال وحاول مجدداً.",
        );
      }
      setLoading(false);
      return;
    }
    try {
      await dbService.saveOfflineSale(saleData.items, saleData.totalAmount);
    } catch {
      if (pointsToRedeem > 0 && selectedPatient) {
        const raw = await AsyncStorage.getItem("pendingLoyaltyRollbacks").catch(
          () => null,
        );
        const queue: { patientId: string; points: number; ts: number }[] = raw
          ? JSON.parse(raw)
          : [];
        queue.push({
          patientId: selectedPatient.id,
          points: pointsToRedeem,
          ts: Date.now(),
        });
        await AsyncStorage.setItem(
          "pendingLoyaltyRollbacks",
          JSON.stringify(queue),
        ).catch(() => {});
        Alert.alert(
          "خطأ",
          "تعذر حفظ عملية البيع. تم تسجيل خصم النقاط — يرجى التواصل مع المشرف لاستعادتها.",
        );
      } else {
        Alert.alert("خطأ", "تعذر حفظ عملية البيع محلياً");
      }
      setLoading(false);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const cartSnapshot = [...cart];
    const patientSnapshot = selectedPatient;
    const finalSnapshot = total;
    setRecentItems((prev) => {
      const soldMap = new Map(cartSnapshot.map((i) => [i.id, i.quantity]));
      const updatedPrev = prev
        .map((r) => {
          const soldQty = soldMap.get(r.id) ?? 0;
          return { ...r, stock: Math.max(0, (r.stock ?? 0) - soldQty) };
        })
        .filter((r) => (r.stock ?? 0) > 0);
      const newItems = cartSnapshot
        .map((i) => ({
          ...i,
          stock: Math.max(0, (i.stock ?? 0) - i.quantity),
          quantity: 1,
        }))
        .filter((i) => (i.stock ?? 0) > 0)
        .slice(0, 5);
      const seen = new Set<string>();
      return [...newItems, ...updatedPrev]
        .filter((i) => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        })
        .slice(0, 5);
    });
    resetCart();
    setLoading(false);
    Alert.alert("تمت العملية", "تمت عملية البيع", [
      {
        text: "طباعة",
        onPress: () => printReceipt(cartSnapshot, finalSnapshot),
      },
      { text: "موافق" },
    ]);
    void syncService.syncData();
    if (
      patientSnapshot &&
      loyaltySettings?.loyaltyEnabled &&
      finalSnapshot > 0
    ) {
      try {
        await apiService.earnLoyaltyPoints(
          patientSnapshot.id,
          null,
          finalSnapshot,
        );
      } catch {
        try {
          const raw = await AsyncStorage.getItem("pendingLoyaltyEarns");
          const queue: { patientId: string; amount: number; ts: number }[] = raw
            ? JSON.parse(raw)
            : [];
          queue.push({
            patientId: patientSnapshot.id,
            amount: finalSnapshot,
            ts: Date.now(),
          });
          await AsyncStorage.setItem(
            "pendingLoyaltyEarns",
            JSON.stringify(queue),
          );
        } catch {
          console.warn("[Sales] Failed to queue pending loyalty earn");
        }
      }
    }
  };

  const printReceipt = async (
    receiptCart: typeof cart,
    receiptTotal: number,
  ) => {
    const printer = await printerService.getSavedPrinter();
    if (!printer) {
      Alert.alert("تنبيه", "لا توجد طابعة متصلة");
      return;
    }
    await printerService.printReceipt(
      "Faramace Pharmacy",
      receiptCart.map((i) => ({
        name: i.tradeName ?? i.name,
        quantity: i.quantity,
        price: i.price,
      })),
      receiptTotal,
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          paddingHorizontal: 14,
          paddingTop: Platform.OS === "ios" ? 8 : 4,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        {/* Title + patient + scan */}
        <View
          style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}
        >
          <Text
            style={{
              color: C.foreground,
              fontSize: 17,
              fontWeight: "900",
              flex: 1,
              textAlign: "right",
            }}
          >
            نقطة البيع
          </Text>

          {/* Patient picker */}
          <TouchableOpacity
            onPress={() => setShowPatientModal(true)}
            activeOpacity={0.8}
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 5,
              backgroundColor: selectedPatient ? C.primaryMuted : C.input,
              borderRadius: 5,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: selectedPatient ? `${C.primary}40` : C.border,
              maxWidth: 140,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                backgroundColor: selectedPatient ? C.primary : C.border,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={selectedPatient ? "person" : "person-add-outline"}
                size={11}
                color={selectedPatient ? "#fff" : C.mutedForeground}
              />
            </View>
            <Text
              style={{
                color: selectedPatient ? C.primary : C.mutedForeground,
                fontSize: 12,
                fontWeight: "600",
              }}
              numberOfLines={1}
            >
              {selectedPatient ? selectedPatient.name : "بدون عميل"}
            </Text>
            {selectedPatient && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedPatient(null);
                  setLoyaltyAccount(null);
                  setPointsToRedeem(0);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close-circle" size={13} color={C.primary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Scan button */}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/scan",
                params: { from: "sales" },
              } as any)
            }
            activeOpacity={0.8}
            style={{
              width: 38,
              height: 38,
              borderRadius: 5,
              backgroundColor: C.primary,
              justifyContent: "center",
              alignItems: "center",
              shadowColor: C.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <Ionicons name="scan" size={19} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Barcode / name search */}
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row-reverse",
              alignItems: "center",
              backgroundColor: C.input,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: notFoundMsg
                ? C.danger
                : nameResults.length > 0
                  ? C.primary
                  : C.border,
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <Ionicons
              name="barcode-outline"
              size={17}
              color={notFoundMsg ? C.danger : C.mutedForeground}
            />
            <TextInput
              style={{
                flex: 1,
                color: C.foreground,
                paddingVertical: 10,
                textAlign: "right",
                fontSize: 14,
              }}
              placeholder="باركود أو اسم الدواء..."
              placeholderTextColor={C.mutedForeground}
              value={barcode}
              onChangeText={(v) => {
                setBarcode(v);
                setNotFoundMsg(null);
              }}
              onSubmitEditing={() => handleBarcodeAdd(barcode)}
              returnKeyType="search"
            />
            {loading || searchingName ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              barcode.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setBarcode("");
                    setNameResults([]);
                    setNotFoundMsg(null);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={C.mutedForeground}
                  />
                </TouchableOpacity>
              )
            )}
          </View>
          <TouchableOpacity
            onPress={() => handleBarcodeAdd(barcode)}
            activeOpacity={0.8}
            style={{
              width: 44,
              borderRadius: 5,
              backgroundColor: C.success,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="search" size={19} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Not found inline message */}
        {notFoundMsg && (
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 8,
              backgroundColor: C.dangerBg,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: `${C.danger}40`,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 5,
                backgroundColor: `${C.danger}20`,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <Ionicons name="search-outline" size={14} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: C.danger,
                  fontWeight: "700",
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                غير موجود
              </Text>
              <Text
                style={{
                  color: C.danger,
                  fontSize: 11,
                  textAlign: "right",
                  marginTop: 1,
                  opacity: 0.85,
                }}
              >
                {notFoundMsg}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setNotFoundMsg(null)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-outline" size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* Name search dropdown results */}
        {nameResults.length > 1 && (
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: C.primary,
              overflow: "hidden",
              maxHeight: 220,
            }}
          >
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: C.primaryMuted,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
              }}
            >
              <Ionicons name="list-outline" size={13} color={C.primary} />
              <Text
                style={{ color: C.primary, fontSize: 11, fontWeight: "700" }}
              >
                {nameResults.length} نتيجة — اختر دواءً
              </Text>
            </View>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {nameResults.map((drug, i) => (
                <TouchableOpacity
                  key={drug.id}
                  onPress={() => handleSelectNameResult(drug)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    gap: 10,
                    borderBottomWidth: i < nameResults.length - 1 ? 1 : 0,
                    borderBottomColor: C.border,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 5,
                      backgroundColor: C.primaryMuted,
                      justifyContent: "center",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons
                      name="medical-outline"
                      size={15}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: C.foreground,
                        fontWeight: "700",
                        fontSize: 13,
                        textAlign: "right",
                      }}
                      numberOfLines={1}
                    >
                      {drug.tradeName}
                    </Text>
                    {drug.scientificName ? (
                      <Text
                        style={{
                          color: C.mutedForeground,
                          fontSize: 11,
                          textAlign: "right",
                          marginTop: 1,
                        }}
                        numberOfLines={1}
                      >
                        {drug.scientificName}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    <Text
                      style={{
                        color: C.success,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {drug.price.toLocaleString("en-US")} د.ع
                    </Text>
                    <Text
                      style={{
                        color: drug.quantity > 0 ? C.mutedForeground : C.danger,
                        fontSize: 10,
                        marginTop: 1,
                      }}
                    >
                      {drug.quantity > 0
                        ? `متبقي ${drug.quantity}`
                        : "نفد المخزون"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Warnings (allergy / interaction) ────────────────────────────── */}
      {(allergyWarnings.length > 0 || interactions.length > 0) && (
        <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 8 }}>
          {allergyWarnings.length > 0 && (
            <View
              style={{
                backgroundColor: C.dangerBg,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: `${C.danger}40`,
                padding: 12,
                flexDirection: "row-reverse",
                gap: 10,
                alignItems: "flex-start",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  backgroundColor: C.danger,
                }}
              />
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 5,
                  backgroundColor: `${C.danger}20`,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 4,
                }}
              >
                <Ionicons name="warning" size={17} color={C.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: C.danger,
                    fontWeight: "800",
                    textAlign: "right",
                    fontSize: 13,
                  }}
                >
                  تحذير حساسية!
                </Text>
                <Text
                  style={{
                    color: C.danger,
                    fontSize: 11,
                    textAlign: "right",
                    marginTop: 2,
                    lineHeight: 16,
                  }}
                >
                  {allergyWarnings.join("، ")}
                </Text>
              </View>
            </View>
          )}
          {interactions.map((ix, i) => {
            const isHigh = ix.severity === "HIGH";
            const color = isHigh ? C.danger : C.warning;
            const bg = isHigh ? C.dangerBg : C.warningBg;
            return (
              <View
                key={i}
                style={{
                  backgroundColor: bg,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: `${color}40`,
                  padding: 12,
                  flexDirection: "row-reverse",
                  gap: 10,
                  alignItems: "flex-start",
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    backgroundColor: color,
                  }}
                />
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 5,
                    backgroundColor: `${color}20`,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 4,
                  }}
                >
                  <Ionicons name="warning" size={17} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color,
                      fontWeight: "800",
                      textAlign: "right",
                      fontSize: 13,
                    }}
                  >
                    تفاعل دوائي ({isHigh ? "خطير" : "متوسط"})
                  </Text>
                  <Text
                    style={{
                      color,
                      fontSize: 11,
                      textAlign: "right",
                      marginTop: 2,
                      lineHeight: 16,
                    }}
                  >
                    {ix.drug1} + {ix.drug2} — {ix.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Quick-add recent chips ───────────────────────────────────────── */}
      {recentItems.length > 0 && cart.length === 0 && (
        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          <Text
            style={{
              color: C.mutedForeground,
              fontSize: 11,
              fontWeight: "700",
              textAlign: "right",
              marginBottom: 8,
              letterSpacing: 0.5,
            }}
          >
            آخر المبيعات
          </Text>
          <View
            style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}
          >
            {recentItems.map((item) => {
              const isLoadingThis = loadingRecentId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleRecentItemPress(item)}
                  disabled={loadingRecentId !== null}
                  activeOpacity={0.75}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 5,
                    borderWidth: 1,
                    borderColor: C.border,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: isLoadingThis ? 0.5 : 1,
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isLoadingThis ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Ionicons
                      name="add-circle-outline"
                      size={13}
                      color={C.primary}
                    />
                  )}
                  <View>
                    <Text
                      style={{
                        color: C.foreground,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {item.tradeName ?? item.name}
                    </Text>
                    <Text
                      style={{ color: C.success, fontSize: 10, marginTop: 1 }}
                    >
                      {item.price.toLocaleString("en-US")} د.ع
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Cart list ────────────────────────────────────────────────────── */}
      <FlatList
        data={cart}
        renderItem={({ item }) => (
          <CartItemRow
            item={item}
            C={C}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
          />
        )}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={cart.length === 0 ? { flex: 1 } : undefined}
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 48,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 5,
                backgroundColor: C.input,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="cart-outline"
                size={36}
                color={C.mutedForeground}
              />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text
                style={{ color: C.foreground, fontWeight: "700", fontSize: 16 }}
              >
                السلة فارغة
              </Text>
              <Text style={{ color: C.mutedForeground, fontSize: 13 }}>
                امسح باركود المنتج أو أدخل اسمه
              </Text>
            </View>
          </View>
        }
      />

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: C.card,
          borderTopWidth: 1,
          borderTopColor: C.border,
          padding: 14,
          paddingBottom: Platform.OS === "ios" ? 28 : 14,
          gap: 10,
        }}
      >
        {/* Manual discount */}
        {cart.length > 0 && (
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              backgroundColor: C.background,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: C.border,
              paddingHorizontal: 12,
              paddingVertical: 8,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 5,
                backgroundColor: C.warningBg,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <Ionicons name="pricetag-outline" size={14} color={C.warning} />
            </View>
            <Text
              style={{
                color: C.foreground,
                fontSize: 13,
                fontWeight: "600",
                flex: 1,
                textAlign: "right",
              }}
            >
              خصم يدوي
            </Text>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                backgroundColor: C.input,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.border,
                paddingHorizontal: 10,
                height: 34,
                gap: 4,
                minWidth: 100,
              }}
            >
              <TextInput
                style={{
                  color: C.foreground,
                  fontSize: 14,
                  fontWeight: "700",
                  textAlign: "right",
                  flex: 1,
                }}
                placeholder="0"
                placeholderTextColor={C.mutedForeground}
                keyboardType="numeric"
                value={manualDiscountInput}
                onChangeText={(v) => {
                  setManualDiscountInput(v);
                  const n = parseFloat(v) || 0;
                  setManualDiscount(Math.min(n, subTotal));
                }}
              />
              <Text style={{ color: C.mutedForeground, fontSize: 11 }}>
                د.ع
              </Text>
            </View>
          </View>
        )}

        {/* Loyalty row */}
        {cart.length > 0 &&
          selectedPatient &&
          loyaltySettings?.loyaltyEnabled &&
          loyaltyAccount && (
            <View
              style={{
                backgroundColor: C.primaryMuted,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: `${C.primary}30`,
                padding: 12,
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Ionicons name="star" size={13} color={C.primary} />
                  <Text
                    style={{
                      color: C.primary,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {loyaltyAccount.tier === "GOLD"
                      ? "ذهبي"
                      : loyaltyAccount.tier === "SILVER"
                        ? "فضي"
                        : "برونزي"}
                  </Text>
                </View>
                <Text
                  style={{ color: C.primary, fontSize: 12, fontWeight: "700" }}
                >
                  {loyaltyAccount.totalPoints.toLocaleString()} نقطة
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => setPointsToRedeem((p) => Math.max(0, p - 100))}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 5,
                    padding: 6,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Ionicons name="remove" size={14} color={C.danger} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text
                    style={{
                      color: C.primary,
                      fontWeight: "800",
                      fontSize: 13,
                    }}
                  >
                    {pointsToRedeem} نقطة
                  </Text>
                  {pointsToRedeem > 0 && (
                    <Text
                      style={{ color: C.success, fontSize: 11, marginTop: 2 }}
                    >
                      خصم {loyaltyDiscount.toLocaleString()} د.ع
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const maxByBalance =
                      Math.floor(loyaltyAccount.totalPoints / 100) * 100;
                    const maxByBill =
                      Math.floor(
                        Math.max(0, subTotal - manualDiscount) /
                          redemptionValue /
                          100,
                      ) * 100;
                    const cap = Math.min(maxByBalance, maxByBill);
                    setPointsToRedeem((p) => Math.min(p + 100, cap));
                  }}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 5,
                    padding: 6,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Ionicons name="add" size={14} color={C.success} />
                </TouchableOpacity>
              </View>
              {loyaltyAccount.totalPoints < minRedemption && (
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 10,
                    textAlign: "center",
                  }}
                >
                  الحد الأدنى للاستبدال {minRedemption} نقطة
                </Text>
              )}
            </View>
          )}

        {/* Total + item count */}
        <View
          style={{
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: C.background,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: C.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <View>
            {totalDiscount > 0 ? (
              <>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 11,
                    textDecorationLine: "line-through",
                    textAlign: "right",
                  }}
                >
                  {subTotal.toLocaleString("en-US")} د.ع
                </Text>
                <Text
                  style={{
                    color: C.foreground,
                    fontSize: 22,
                    fontWeight: "900",
                    textAlign: "right",
                  }}
                >
                  {total.toLocaleString("en-US")}{" "}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: C.mutedForeground,
                    }}
                  >
                    د.ع
                  </Text>
                </Text>
                <Text
                  style={{ color: C.success, fontSize: 11, textAlign: "right" }}
                >
                  وفرت {totalDiscount.toLocaleString("en-US")} د.ع
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 11,
                    textAlign: "right",
                  }}
                >
                  المجموع الكلي
                </Text>
                <Text
                  style={{
                    color: C.foreground,
                    fontSize: 24,
                    fontWeight: "900",
                    textAlign: "right",
                  }}
                >
                  {total.toLocaleString("en-US")}{" "}
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: C.mutedForeground,
                    }}
                  >
                    د.ع
                  </Text>
                </Text>
              </>
            )}
          </View>
          {itemCount > 0 && (
            <View
              style={{
                backgroundColor: C.primaryMuted,
                borderRadius: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text
                style={{ color: C.primary, fontWeight: "700", fontSize: 13 }}
              >
                {itemCount} صنف
              </Text>
            </View>
          )}
        </View>

        {/* Checkout buttons */}
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <TouchableOpacity
            onPress={() => handleCheckout("CREDIT")}
            disabled={cart.length === 0 || loading}
            activeOpacity={0.8}
            style={{
              flex: 1,
              flexDirection: "row-reverse",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              backgroundColor: cart.length === 0 ? C.border : C.warning,
              borderRadius: 5,
              paddingVertical: 14,
              opacity: cart.length === 0 ? 0.5 : 1,
            }}
          >
            <Ionicons
              name="time-outline"
              size={18}
              color={cart.length === 0 ? "#000000" : "#fff"}
            />
            <Text
              style={{
                color: cart.length === 0 ? "#000000" : "#fff",
                fontWeight: "800",
                fontSize: 15,
              }}
            >
              آجل
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCheckout("CASH")}
            disabled={cart.length === 0 || loading}
            activeOpacity={0.8}
            style={{
              flex: 2,
              flexDirection: "row-reverse",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              backgroundColor: cart.length === 0 ? C.border : C.success,
              borderRadius: 5,
              paddingVertical: 14,
              opacity: cart.length === 0 ? 0.5 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color={cart.length === 0 ? "#000000" : "#fff"}
                />
                <Text
                  style={{
                    color: cart.length === 0 ? "#000000" : "#fff",
                    fontWeight: "800",
                    fontSize: 15,
                  }}
                >
                  نقدي
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Patient Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showPatientModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPatientModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: C.card,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 20,
              maxHeight: "72%",
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: C.border,
                borderRadius: 2,
                alignSelf: "center",
                marginBottom: 16,
              }}
            />

            <Text
              style={{
                color: C.foreground,
                fontSize: 16,
                fontWeight: "800",
                textAlign: "right",
                marginBottom: 14,
              }}
            >
              بحث عن عميل
            </Text>

            {/* Search input */}
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                backgroundColor: C.input,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: C.border,
                paddingHorizontal: 12,
                marginBottom: 14,
                gap: 8,
              }}
            >
              <Ionicons
                name="search-outline"
                size={17}
                color={C.mutedForeground}
              />
              <TextInput
                style={{
                  flex: 1,
                  color: C.foreground,
                  paddingVertical: 11,
                  textAlign: "right",
                  fontSize: 14,
                }}
                placeholder="الاسم أو رقم الهاتف..."
                placeholderTextColor={C.mutedForeground}
                value={patientQuery}
                onChangeText={setPatientQuery}
                autoFocus
              />
              {searchingPatient && (
                <ActivityIndicator size="small" color={C.primary} />
              )}
            </View>

            {/* Results */}
            {patientResults.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  setSelectedPatient(p);
                  setShowPatientModal(false);
                  setPatientQuery("");
                }}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  paddingVertical: 12,
                  gap: 12,
                  borderBottomWidth: i < patientResults.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 5,
                    backgroundColor: C.primaryMuted,
                    justifyContent: "center",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Text
                    style={{
                      color: C.primary,
                      fontSize: 13,
                      fontWeight: "900",
                    }}
                  >
                    {p.name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: C.foreground,
                      fontWeight: "700",
                      textAlign: "right",
                      fontSize: 14,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      color: C.mutedForeground,
                      fontSize: 12,
                      textAlign: "right",
                      marginTop: 1,
                    }}
                  >
                    {p.phone}
                  </Text>
                </View>
                {p.balance !== undefined && p.balance > 0 && (
                  <View
                    style={{
                      backgroundColor: C.dangerBg,
                      borderRadius: 5,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: C.danger,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {p.balance.toLocaleString("en-US")} د.ع
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {/* Close button */}
            <TouchableOpacity
              onPress={() => setShowPatientModal(false)}
              activeOpacity={0.75}
              style={{
                flexDirection: "row-reverse",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                backgroundColor: C.input,
                borderRadius: 5,
                paddingVertical: 12,
                marginTop: 14,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Ionicons
                name="close-outline"
                size={18}
                color={C.mutedForeground}
              />
              <Text
                style={{ color: C.foreground, fontWeight: "600", fontSize: 14 }}
              >
                إغلاق
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
