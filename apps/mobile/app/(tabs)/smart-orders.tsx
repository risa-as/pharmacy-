import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Animated,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiService, newIdempotencyKey } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { managerPalette, Radius } from "../../constants/colors";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import {
  usePalette,
  useReduceMotion,
  Surface,
  StatusBadge,
  StatCell,
  VDivider,
  AppButton,
} from "../../components/ui/Kit";
import { formatNumber } from "../../utils/format";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { BranchSelector } from "../../components/BranchSelector";
import {
  PlanningReason,
  PlanningSettingsSheet,
} from "../../components/SmartPlanning";
import {
  PlanningItem,
  PlanningResult,
  PlanningSettings,
  PlanningFilter,
  planningFilters,
  matchesPlanningFilter,
  recentPeriod,
  numberText as n,
} from "../../utils/smart-planning";

interface SmartOrderItem extends PlanningItem {
  id: string;
  drugId: string;
  branchId: string;
  drug?: { tradeName?: string; scientificName?: string };
  currentQuantity: number;
  suggestedReorderQuantity: number;
  daysUntilStockout?: number;
  branch?: { name?: string };
}

interface CreateOrderItem {
  drugId: string;
  drugName: string;
  quantity: number;
  cost: number;
  isCritical: boolean;
  currentQuantity: number;
}

interface CreatedOrderSummary {
  supplierName: string;
  itemCount: number;
  criticalCount: number;
  totalUnits: number;
  branchName: string | null;
}

type FilterKey = PlanningFilter;

function getUrgency(item: SmartOrderItem): "critical" | "low" {
  if (item.currentQuantity === 0) return "critical";
  if (item.daysUntilStockout !== undefined && item.daysUntilStockout <= 3)
    return "critical";
  return "low";
}

export default function SmartOrdersScreen() {
  const { isDarkMode } = useTheme();
  const { isAdmin, branchId: authBranchId, can, features } = useAuth();
  const C = managerPalette(isDarkMode);

  // ── Main list state ───────────────────────────────────────────────────────
  const [items, setItems] = useState<SmartOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(
    authBranchId,
  );
  const [filterKey, setFilterKey] = useState<FilterKey>("action");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [settings, setSettings] = useState<PlanningSettings>({
    ...recentPeriod(30),
    coverageDays: 15,
    leadDays: 0,
    safetyDays: 0,
    fromArrival: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<PlanningResult | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const fetchVersion = useRef(0);
  const submitLock = useRef(false);
  const purchaseAttempt = useRef({ signature: "", key: "" });
  const quantityFor = (r: SmartOrderItem) =>
    Number(quantities[r.id] ?? r.suggestedQty);

  // ── Create-order modal state ──────────────────────────────────────────────
  const [createModal, setCreateModal] = useState<{
    items: CreateOrderItem[];
    branchId: string;
  } | null>(null);
  const [suppliers, setSuppliers] = useState<
    Array<{ id: string; name: string; phone?: string }>
  >([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receiveBranchName, setReceiveBranchName] = useState<string | null>(
    null,
  );
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderSummary | null>(
    null,
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (fresh = false) => {
      const version = ++fetchVersion.current;
      setFetchError("");
      try {
        const data = await apiService.getSmartPlanning(
          settings,
          selectedBranch ?? undefined,
          fresh,
        );
        if (version !== fetchVersion.current) return;
        setAnalysis(data);
        setItems(
          data.rows.map((r) => ({
            ...r,
            id: r.inventoryId,
            drug: { tradeName: r.drugName, scientificName: r.scientificName },
            branch: { name: r.branchName },
            currentQuantity: r.currentStock,
            suggestedReorderQuantity: r.suggestedQty,
            daysUntilStockout:
              r.coverage === null ? undefined : Math.floor(r.coverage),
          })),
        );
      } catch (error) {
        if (version === fetchVersion.current) {
          setItems([]);
          setAnalysis(null);
          setFetchError("تعذر تحديث التحليل. تحقق من الاتصال ثم أعد المحاولة.");
        }
      } finally {
        if (version === fetchVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedBranch, settings],
  );
  useEffect(() => {
    setLoading(true);
    fetchData();
    return () => {
      fetchVersion.current++;
    };
  }, [fetchData]);
  useEffect(() => {
    setSelectedIds(new Set());
    setQuantities({});
  }, [selectedBranch]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);
  const searched = useMemo(
    () =>
      items.filter((i) =>
        [i.drugName, i.scientificName, i.barcode].some((v) =>
          v.toLowerCase().includes(search.trim().toLowerCase()),
        ),
      ),
    [items, search],
  );
  const filtered = useMemo(
    () =>
      searched
        .filter((i) => matchesPlanningFilter(i, filterKey))
        .sort(
          (a, b) =>
            Number(b.out) - Number(a.out) ||
            b.urgentUnits - a.urgentUnits ||
            a.drugName.localeCompare(b.drugName),
        ),
    [searched, filterKey],
  );
  const eligible = filtered.filter(
    (i) =>
      i.suggestedQty > 0 &&
      i.qualityReasons.length === 0 &&
      i.unitsPerPack !== null,
  );

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter((s) =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
      ),
    [suppliers, supplierSearch],
  );

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Keep selections across filters; bulk selection affects eligible visible results only.
  const allFilteredSelected =
    eligible.length > 0 && eligible.every((i) => selectedIds.has(i.id));

  const toggleSelectAll = useCallback(() => {
    setQuantities((prev) => {
      const next = { ...prev };
      eligible.forEach((i) => {
        next[i.id] ??= String(i.suggestedQty);
      });
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (eligible.length > 0 && eligible.every((i) => prev.has(i.id)))
        eligible.forEach((i) => next.delete(i.id));
      else eligible.forEach((i) => next.add(i.id));
      return next;
    });
  }, [eligible]);

  // Selected items from every tab, urgent first (same order as the list).
  const selectedItems = useMemo(
    () =>
      items
        .filter((i) => selectedIds.has(i.id))
        .sort((a, b) => {
          const ua = getUrgency(a) === "critical" ? 0 : 1;
          const ub = getUrgency(b) === "critical" ? 0 : 1;
          if (ua !== ub) return ua - ub;
          return (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999);
        }),
    [items, selectedIds],
  );
  const selectedCritical = selectedItems.filter(
    (i) => getUrgency(i) === "critical",
  ).length;

  // ── Create order helpers ──────────────────────────────────────────────────
  const openCreateModal = useCallback(
    (item?: SmartOrderItem) => {
      const targets = item ? [item] : selectedItems;
      if (!can("canCreatePurchase") || loading || refreshing || fetchError || targets.length === 0) return;
      if (
        targets.some(
          (t) => !Number.isSafeInteger(quantityFor(t)) || quantityFor(t) <= 0,
        )
      ) {
        Alert.alert(
          "راجع الكميات",
          "أدخل كمية صحيحة أكبر من صفر لكل صنف؛ الأصناف دون مبيعات تحتاج قرارك اليدوي.",
        );
        return;
      }
      if (!item && selectedIds.size !== targets.length) {
        Alert.alert(
          "راجع الاختيار",
          "بعض الأصناف لم تعد موجودة في التحليل. امسح الاختيار وأعد تحديدها.",
        );
        return;
      }
      // One purchase order receives into ONE branch — never guess across branches.
      const branchIds = Array.from(
        new Set(targets.map((t) => t.branchId).filter(Boolean)),
      );
      if (!selectedBranch && branchIds.length > 1) {
        Alert.alert(
          "اختر فرع الاستلام",
          "الأصناف المحددة تتبع أكثر من فرع. اختر فرعاً واحداً من قائمة الفروع ثم أنشئ الطلب.",
        );
        return;
      }
      const branchId = selectedBranch ?? branchIds[0] ?? authBranchId ?? "";
      setReceiveBranchName(
        targets.find((t) => t.branchId === branchId)?.branch?.name ?? null,
      );
      setCreateModal({
        items: targets.map((t) => ({
          drugId: t.drugId,
          drugName: t.drug?.tradeName ?? "دواء غير محدد",
          quantity: quantityFor(t),
          cost: 0,
          isCritical: getUrgency(t) === "critical",
          currentQuantity: t.currentQuantity,
        })),
        branchId,
      });
      setSupplierId("");
      setSupplierName("");
      setSupplierSearch("");
      setShowSupplierPicker(false);
      setLoadingSuppliers(true);
      apiService
        .getSuppliers()
        .then(setSuppliers)
        .catch(() => {})
        .finally(() => setLoadingSuppliers(false));
    },
    [
      can,
      selectedItems,
      selectedBranch,
      authBranchId,
      quantities,
      loading,
      refreshing,
      fetchError,
      selectedIds,
    ],
  );

  const updateCreateItem = useCallback(
    (idx: number, field: "quantity" | "cost", value: string) => {
      setCreateModal((prev) => {
        if (!prev) return prev;
        const next = [...prev.items];
        next[idx] = { ...next[idx], [field]: parseFloat(value) || 0 };
        return { ...prev, items: next };
      });
    },
    [],
  );

  const handleSubmitOrder = useCallback(async () => {
    if (!createModal || !supplierId || submitLock.current) return;
    if (
      createModal.items.some(
        (i) => !Number.isSafeInteger(i.quantity) || i.quantity <= 0,
      )
    ) {
      Alert.alert("خطأ", "يجب أن تكون الكمية أكبر من صفر لجميع الأصناف");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const signature = JSON.stringify({ ...createModal, supplierId });
      if (purchaseAttempt.current.signature !== signature) purchaseAttempt.current = { signature, key: newIdempotencyKey() };
      await apiService.createPurchase({
        idempotencyKey: purchaseAttempt.current.key,
        branchId: createModal.branchId,
        supplierId,
        items: createModal.items.map((i) => ({
          drugId: i.drugId,
          quantity: i.quantity,
          cost: i.cost,
        })),
      });
      purchaseAttempt.current={signature:"",key:""};
      setCreatedOrder({
        supplierName,
        itemCount: createModal.items.length,
        criticalCount: createModal.items.filter((i) => i.isCritical).length,
        totalUnits: createModal.items.reduce((s, i) => s + i.quantity, 0),
        branchName: receiveBranchName,
      });
      setCreateModal(null);
      setSelectedIds(new Set());
      setQuantities({});
      onRefresh();
    } catch {
      Alert.alert("خطأ", "فشل في إنشاء طلب الشراء، يرجى المحاولة مرة أخرى");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [createModal, supplierId, supplierName, receiveBranchName, onRefresh]);

  const renderItem = ({ item }: { item: SmartOrderItem }) => {
    const selected = selectedIds.has(item.id);
    const value = quantityFor(item);
    return (
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: selected ? C.primary : C.border,
          marginBottom: 12,
          padding: 14,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row-reverse",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <TouchableOpacity
            onPress={() => {
              if (!selected)
                setQuantities((prev) => ({
                  ...prev,
                  [item.id]: prev[item.id] ?? String(item.suggestedQty),
                }));
              toggleSelect(item.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`تحديد ${item.drugName}`}
            hitSlop={8}
          >
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={25}
              color={selected ? C.primary : C.mutedForeground}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: C.foreground,
                fontSize: 16,
                fontWeight: "800",
                textAlign: "right",
              }}
            >
              {item.drugName}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: C.mutedForeground,
                fontSize: 12,
                marginTop: 4,
                textAlign: "right",
              }}
            >
              {item.barcode || item.scientificName}
            </Text>
            <Text
              style={{
                color: C.mutedForeground,
                fontSize: 11,
                textAlign: "right",
                marginTop: 3,
              }}
            >
              {item.branchName} · وحدة المخزون
            </Text>
          </View>
          <StatusBadge
            label={
              item.out
                ? "نافد"
                : item.insufficient
                  ? "لا يغطي المدة"
                  : item.noDemand
                    ? "مراجعة"
                    : "متابعة"
            }
            tone={item.out ? "danger" : "warning"}
          />
        </View>
        <View
          style={{
            flexDirection: "row-reverse",
            borderRadius: Radius.control,
            backgroundColor: C.background,
            paddingVertical: 10,
          }}
        >
          <StatCell
            label="المتاح"
            value={n(item.currentStock)}
            align="center"
          />
          <VDivider />
          <StatCell
            label="مبيعات الفترة"
            value={n(item.netSales)}
            align="center"
          />
          <VDivider />
          <StatCell label="القادم" value={n(item.pending)} align="center" />
        </View>
        <Text
          style={{ color: C.mutedForeground, fontSize: 12, textAlign: "right" }}
        >
          {n(item.averageDailySales)} وحدة / يوم ·{" "}
          {item.coverage === null
            ? "التغطية غير قابلة للتقدير"
            : `يكفي نحو ${n(item.coverage)} يوم`}
        </Text>
        <View
          style={{
            flexDirection: "row-reverse",
            gap: 12,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: C.foreground,
                fontWeight: "700",
                textAlign: "right",
                fontSize: 13,
              }}
            >
              كمية الطلب · وحدة مخزون
            </Text>
            <Text
              style={{
                color: C.mutedForeground,
                fontSize: 12,
                textAlign: "right",
                marginTop: 4,
              }}
            >
              المقترح: {n(item.suggestedQty)} ·{" "}
              {item.cost === null
                ? "السعر غير متوفر"
                : `${n((Number.isFinite(value) ? value : 0) * item.cost)} د.ع تقديرياً`}
            </Text>
          </View>
          <TextInput
            accessibilityLabel={`كمية ${item.drugName}`}
            keyboardType="number-pad"
            value={quantities[item.id] ?? String(item.suggestedQty)}
            onChangeText={(v) =>
              setQuantities((prev) => ({
                ...prev,
                [item.id]: v.replace(/[٠-٩]/g, (c) =>
                  String(c.charCodeAt(0) - 1632),
                ),
              }))
            }
            style={{
              width: 85,
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: Radius.control,
              backgroundColor: C.input,
              color: C.foreground,
              padding: 10,
              textAlign: "center",
            }}
          />
        </View>
        {item.noDemand && item.low && (
          <AppButton
            compact
            variant="outline"
            label={`استكمال الحد الأدنى (${n(Math.max(0, item.minStock - item.currentStock))})`}
            onPress={() =>
              setQuantities((prev) => ({
                ...prev,
                [item.id]: String(
                  Math.max(0, Math.ceil(item.minStock - item.currentStock)),
                ),
              }))
            }
          />
        )}
        <PlanningReason row={item} settings={settings} />
        <AppButton
          permission="canCreatePurchase" label="مراجعة الطلب"
          icon="document-text-outline"
          compact
          onPress={() => openCreateModal(item)}
        />
      </View>
    );
  };
  const sendToWarehouse = () => {
    if (!can('canCreateWarehouseOrder')) return;
    const targets = selectedItems;
    if (!targets.length || new Set(targets.map(r=>r.branchId)).size !== 1) { Alert.alert('راجع الاختيار','اختر أصناف فرع واحد.'); return; }
    if (targets.some(r=>!r.unitsPerPack || !r.barcode || !Number.isSafeInteger(quantityFor(r)) || quantityFor(r)<=0)) { Alert.alert('راجع التعبئة والكميات','أكد عدد وحدات الباكيت والباركود، وأدخل كميات صحيحة قبل طلب المذخر.'); return; }
    router.push({pathname:'/warehouse-orders' as any,params:{draft:JSON.stringify({branchId:targets[0].branchId,items:targets.map(r=>({barcode:r.barcode,name:r.drugName,quantity:Math.ceil(quantityFor(r)/r.unitsPerPack!)}))})}});
  };
  const listHeader = (
    <View style={{ gap: 12, paddingBottom: 14 }}>
      {features.warehouseManagement && can('canCreateWarehouseOrder') && selectedItems.length > 0 && <AppButton label="مراجعة المختارات وطلبها من مذخر" icon="business-outline" onPress={sendToWarehouse} disabled={loading || refreshing || !!fetchError} />}
      <Surface style={{ gap: 10 }}>
        <Text
          style={{
            color: C.foreground,
            fontSize: 17,
            fontWeight: "800",
            textAlign: "right",
          }}
        >
          خطّط لشراء احتياجك الفعلي
        </Text>
        <Text
          style={{
            color: C.mutedForeground,
            fontSize: 12,
            lineHeight: 20,
            textAlign: "right",
          }}
        >
          {settings.from} — {settings.to}
          {"\n"}تغطية {settings.coverageDays} يوم{" "}
          {settings.fromArrival ? "من الوصول" : "من اليوم"} · وصول{" "}
          {settings.leadDays} · أمان {settings.safetyDays}
        </Text>
        <AppButton
          label="الفترة وإعدادات التغطية"
          icon="options-outline"
          variant="outline"
          compact
          onPress={() => setSettingsOpen(true)}
        />
      </Surface>
      {isAdmin && (
        <BranchSelector
          selectedBranchId={selectedBranch}
          onSelectBranch={setSelectedBranch}
          hideIfSingle
          inline
          label="الفرع"
        />
      )}
      {analysis && (
        <Text
          style={{
            color: C.mutedForeground,
            fontSize: 11,
            lineHeight: 18,
            textAlign: "right",
          }}
        >
          {analysis.notice}
          {"\n"}آخر تحديث:{" "}
          {new Date(analysis.generatedAt).toLocaleString("en-GB")}
        </Text>
      )}
      {analysis && !loading && !refreshing && !fetchError && can("canExportExcel") && (
        <AppButton
          label="مشاركة تقرير النتائج"
          icon="share-outline"
          compact
          variant="outline"
          onPress={async () => {
            const message = [
              `تقرير الشراء الذكي · ${settings.from} — ${settings.to}`,
              `تغطية ${settings.coverageDays} يوم · وصول ${settings.leadDays} · أمان ${settings.safetyDays}`,
              `تبدأ التغطية: ${settings.fromArrival ? "من الوصول" : "من اليوم"}`,
              `عدد نتائج الفلتر: ${filtered.length}`,
              ...filtered.map(
                (r) =>
                  `${r.drugName} | ${r.barcode} | ${r.branchName}\nالمتاح ${n(r.currentStock)} · صافي المبيعات ${n(r.netSales)} · معدل يومي ${n(r.averageDailySales)} · المقترح ${n(r.suggestedQty)} وحدة\n${r.qualityReasons.join(" · ")}`,
              ),
              analysis.notice,
            ].join("\n\n");
            try {
              await Share.share({ title: "تقرير الشراء الذكي", message });
            } catch {
              Alert.alert("تعذر مشاركة التقرير", "حاول مرة أخرى.");
            }
          }}
        />
      )}
      <TextInput
        accessibilityLabel="بحث الأدوية"
        placeholder="اسم الدواء، الاسم العلمي، الباركود"
        placeholderTextColor={C.mutedForeground}
        value={search}
        onChangeText={setSearch}
        style={{
          color: C.foreground,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: Radius.control,
          padding: 12,
          textAlign: "right",
        }}
      />
      <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }}>
        {planningFilters.map((f) => (
          <TouchableOpacity
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: filterKey === f.key }}
            onPress={() => setFilterKey(f.key)}
            style={{
              width: "23%",
              flexGrow: 1,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: Radius.control,
              borderWidth: 1,
              borderColor: filterKey === f.key ? C.primary : C.border,
              backgroundColor: filterKey === f.key ? C.primaryMuted : C.card,
            }}
          >
            <Text
              style={{
                color: filterKey === f.key ? C.primary : C.mutedForeground,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {f.label}
            </Text>
            <Text
              style={{
                color: C.foreground,
                fontSize: 16,
                fontWeight: "800",
                marginTop: 5,
              }}
            >
              {loading
                ? "—"
                : n(
                    searched.filter((i) => matchesPlanningFilter(i, f.key))
                      .length,
                  )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!loading && !fetchError && (
        <AppButton
          variant="outline"
          compact
          label={
            allFilteredSelected
              ? "إلغاء تحديد المؤهل"
              : `تحديد المؤهل من النتائج (${eligible.length})`
          }
          onPress={toggleSelectAll}
        />
      )}
      {!!fetchError && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: C.danger, textAlign: "right" }}>
            {fetchError}
          </Text>
          <AppButton label="إعادة المحاولة" onPress={onRefresh} compact />
        </View>
      )}
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title="الطلبات الذكية" fallbackHref="/(tabs)/more" />

      <FlatList
        data={loading || refreshing || fetchError ? [] : filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: selectedItems.length ? 150 : 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
        ListEmptyComponent={
          loading || refreshing ? (
            <View style={{ gap: 12 }}>
              <Skeleton height={180} radius={Radius.card} />
              <Skeleton height={180} radius={Radius.card} />
            </View>
          ) : fetchError ? null : (
            <EmptyState
              icon="search-outline"
              title="لا توجد أصناف بهذه الفئة"
              subtitle="غيّر الفلتر أو عبارة البحث لعرض نتائج أخرى"
            />
          )
        }
      />
      {settingsOpen && (
        <PlanningSettingsSheet
          value={settings}
          onClose={() => setSettingsOpen(false)}
          onApply={(value) => {
            setSettingsOpen(false);
            setLoading(true);
            setSettings(value);
          }}
        />
      )}

      {/* ── Bottom action bar (multi-select) ───────────────────────── */}
      {selectedItems.length > 0 && !loading && !refreshing && !fetchError && (
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            backgroundColor: C.card,
            borderRadius: Radius.card,
            borderWidth: 1,
            borderColor: C.primary,
            padding: 12,
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: C.foreground,
                fontSize: 14,
                fontWeight: "800",
                textAlign: "right",
              }}
            >
              {formatNumber(selectedItems.length)} صنف محدد
            </Text>
            {/* Shows that the selection spans tabs */}
            <Text
              style={{
                color: C.mutedForeground,
                fontSize: 12,
                textAlign: "right",
                marginTop: 1,
              }}
            >
              {n(
                selectedItems.reduce(
                  (sum, r) =>
                    sum +
                    (Number.isFinite(quantityFor(r)) ? quantityFor(r) : 0) *
                      (r.cost ?? 0),
                  0,
                ),
              )}{" "}
              د.ع تقديرياً ·{" "}
              {selectedItems.filter((r) => r.cost === null).length} دون سعر
            </Text>
          </View>
          <AppButton
            label="إلغاء"
            variant="outline"
            compact
            onPress={() => setSelectedIds(new Set())}
          />
          <AppButton
            permission="canCreatePurchase" label="مراجعة الطلب"
            icon="document-text-outline"
            compact
            onPress={() => openCreateModal()}
          />
        </View>
      )}

      {/* ── Create Order Modal ──────────────────────────────────────── */}
      <Modal
        visible={createModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submitting) {
            setCreateModal(null);
            setShowSupplierPicker(false);
          }
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={{
                backgroundColor: C.background,
                borderTopLeftRadius: Radius.card,
                borderTopRightRadius: Radius.card,
                maxHeight: "88%",
              }}
            >
              {showSupplierPicker ? (
                /* ── Supplier picker ─────────────────────────────────── */
                <>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: C.border,
                    }}
                  >
                    <Text
                      style={{
                        color: C.foreground,
                        fontSize: 18,
                        fontWeight: "800",
                      }}
                    >
                      اختر المورد
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowSupplierPicker(false)}
                    >
                      <Ionicons
                        name="arrow-forward"
                        size={22}
                        color={C.foreground}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Supplier search */}
                  <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        backgroundColor: C.input,
                        borderRadius: Radius.control,
                        borderWidth: 1,
                        borderColor: C.border,
                        paddingHorizontal: 12,
                        gap: 8,
                      }}
                    >
                      <Ionicons
                        name="search"
                        size={15}
                        color={C.mutedForeground}
                      />
                      <TextInput
                        style={{
                          flex: 1,
                          color: C.foreground,
                          paddingVertical: 10,
                          textAlign: "right",
                          fontSize: 13,
                        }}
                        placeholder="ابحث عن مورد..."
                        placeholderTextColor={C.mutedForeground}
                        value={supplierSearch}
                        onChangeText={setSupplierSearch}
                        returnKeyType="search"
                      />
                    </View>
                  </View>

                  <FlatList
                    data={filteredSuppliers}
                    keyExtractor={(s) => s.id}
                    style={{ maxHeight: 340 }}
                    // First tap selects even while the search keyboard is open.
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    renderItem={({ item: s }) => {
                      const isActive = supplierId === s.id;
                      return (
                        <TouchableOpacity
                          onPress={() => {
                            Keyboard.dismiss();
                            setSupplierId(s.id);
                            setSupplierName(s.name);
                            setShowSupplierPicker(false);
                          }}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: "row-reverse",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: C.border,
                            backgroundColor: isActive
                              ? C.primaryMuted
                              : "transparent",
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: isActive ? C.primary : C.foreground,
                                fontSize: 14,
                                fontWeight: isActive ? "700" : "400",
                                textAlign: "right",
                              }}
                            >
                              {s.name}
                            </Text>
                            {s.phone && (
                              <Text
                                style={{
                                  color: C.mutedForeground,
                                  fontSize: 11,
                                  textAlign: "right",
                                  marginTop: 2,
                                }}
                              >
                                {s.phone}
                              </Text>
                            )}
                          </View>
                          {isActive && (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color={C.primary}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View
                        style={{ padding: 32, alignItems: "center", gap: 8 }}
                      >
                        <Ionicons
                          name="business-outline"
                          size={32}
                          color={C.mutedForeground}
                        />
                        <Text
                          style={{ color: C.mutedForeground, fontSize: 13 }}
                        >
                          {supplierSearch
                            ? `لا يوجد مورد بهذا الاسم`
                            : "لا يوجد موردون مسجلون"}
                        </Text>
                      </View>
                    }
                  />
                </>
              ) : (
                /* ── Main create order view ──────────────────────────── */
                <>
                  {/* Header */}
                  <View
                    style={{
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: C.border,
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
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: C.primaryMuted,
                            borderRadius: Radius.control,
                            padding: 7,
                          }}
                        >
                          <Ionicons name="cart" size={18} color={C.primary} />
                        </View>
                        <Text
                          style={{
                            color: C.foreground,
                            fontSize: 18,
                            fontWeight: "900",
                          }}
                        >
                          مراجعة طلب الشراء
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setCreateModal(null)}
                        disabled={submitting}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="close"
                          size={24}
                          color={submitting ? C.border : C.foreground}
                        />
                      </TouchableOpacity>
                    </View>
                    {/* Summary chips */}
                    {createModal && (
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          gap: 6,
                          marginTop: 10,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: C.primaryMuted,
                            borderRadius: Radius.control,
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            flexDirection: "row-reverse",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: C.primary,
                              fontSize: 12,
                              fontWeight: "700",
                            }}
                          >
                            {createModal.items.length} صنف
                          </Text>
                        </View>
                        {createModal.items.filter((i) => i.isCritical).length >
                          0 && (
                          <View
                            style={{
                              backgroundColor: C.dangerBg,
                              borderRadius: Radius.control,
                              paddingHorizontal: 9,
                              paddingVertical: 4,
                              flexDirection: "row-reverse",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Ionicons
                              name="warning"
                              size={11}
                              color={C.danger}
                            />
                            <Text
                              style={{
                                color: C.danger,
                                fontSize: 12,
                                fontWeight: "700",
                              }}
                            >
                              {
                                createModal.items.filter((i) => i.isCritical)
                                  .length
                              }{" "}
                              عاجل
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  <ScrollView
                    contentContainerStyle={{ padding: 16 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Supplier picker */}
                    <Text
                      style={{
                        color: C.mutedForeground,
                        fontSize: 12,
                        fontWeight: "600",
                        textAlign: "right",
                        marginBottom: 6,
                      }}
                    >
                      المورد *
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        !loadingSuppliers && setShowSupplierPicker(true)
                      }
                      activeOpacity={0.8}
                      style={{
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: C.input,
                        borderRadius: Radius.control,
                        borderWidth: 1.5,
                        borderColor: supplierId ? C.primary : C.border,
                        paddingHorizontal: 13,
                        paddingVertical: 13,
                        marginBottom: 20,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 8,
                          flex: 1,
                        }}
                      >
                        {loadingSuppliers ? (
                          <ActivityIndicator
                            size="small"
                            color={C.mutedForeground}
                          />
                        ) : (
                          <Ionicons
                            name={supplierId ? "business" : "business-outline"}
                            size={17}
                            color={supplierId ? C.primary : C.mutedForeground}
                          />
                        )}
                        <Text
                          style={{
                            color: supplierId
                              ? C.foreground
                              : C.mutedForeground,
                            fontSize: 14,
                            fontWeight: supplierId ? "700" : "400",
                          }}
                        >
                          {loadingSuppliers
                            ? "جاري تحميل الموردين..."
                            : supplierName || "اختر المورد..."}
                        </Text>
                      </View>
                      {!loadingSuppliers &&
                        (supplierId ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={C.primary}
                          />
                        ) : (
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color={C.mutedForeground}
                          />
                        ))}
                    </TouchableOpacity>

                    {/* Receiving branch */}
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: C.card,
                        borderRadius: Radius.control,
                        borderWidth: 1,
                        borderColor: C.border,
                        paddingHorizontal: 13,
                        paddingVertical: 12,
                        marginBottom: 20,
                      }}
                    >
                      <Text style={{ color: C.mutedForeground, fontSize: 13 }}>
                        فرع الاستلام
                      </Text>
                      <Text
                        style={{
                          color: C.foreground,
                          fontSize: 14,
                          fontWeight: "700",
                        }}
                      >
                        {receiveBranchName ?? "فرعك الحالي"}
                      </Text>
                    </View>

                    {/* Items list */}
                    <Text
                      style={{
                        color: C.mutedForeground,
                        fontSize: 12,
                        fontWeight: "600",
                        textAlign: "right",
                        marginBottom: 10,
                      }}
                    >
                      الأصناف ({createModal?.items.length ?? 0})
                    </Text>

                    <View style={{ gap: 8 }}>
                      {createModal?.items.map((item, idx) => {
                        const accent = item.isCritical ? C.danger : C.warning;
                        const qty = item.quantity;
                        return (
                          <View
                            key={item.drugId}
                            style={{
                              flexDirection: "row-reverse",
                              alignItems: "center",
                              gap: 10,
                              backgroundColor: C.card,
                              borderRadius: Radius.control,
                              borderWidth: 1,
                              borderColor: qty > 0 ? C.border : C.danger,
                              paddingVertical: 9,
                              paddingRight: 12,
                              paddingLeft: 8,
                            }}
                          >
                            {/* Name + urgency/stock line */}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                style={{
                                  color: C.foreground,
                                  fontWeight: "800",
                                  fontSize: 14,
                                  textAlign: "right",
                                }}
                                numberOfLines={1}
                              >
                                {item.drugName}
                              </Text>
                              <View
                                style={{
                                  flexDirection: "row-reverse",
                                  alignItems: "center",
                                  gap: 5,
                                  marginTop: 2,
                                }}
                              >
                                <View
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: accent,
                                  }}
                                />
                                <Text
                                  style={{
                                    color: accent,
                                    fontSize: 11.5,
                                    fontWeight: "700",
                                  }}
                                >
                                  {item.isCritical ? "عاجل" : "متابعة"}
                                </Text>
                                <Text
                                  style={{
                                    color: C.mutedForeground,
                                    fontSize: 11.5,
                                  }}
                                >
                                  · المتوفر {formatNumber(item.currentQuantity)}
                                </Text>
                              </View>
                            </View>

                            {/* Quantity only — the price is set when the goods are received */}
                            <View
                              style={{
                                flexDirection: "row-reverse",
                                alignItems: "center",
                                backgroundColor: C.input,
                                borderRadius: Radius.control,
                                borderWidth: 1,
                                borderColor: C.border,
                                height: 38,
                              }}
                            >
                              <TouchableOpacity
                                onPress={() =>
                                  updateCreateItem(
                                    idx,
                                    "quantity",
                                    String(qty + 1),
                                  )
                                }
                                hitSlop={4}
                                accessibilityLabel={`زيادة كمية ${item.drugName}`}
                                style={{
                                  width: 34,
                                  height: "100%",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Ionicons
                                  name="add"
                                  size={18}
                                  color={C.primary}
                                />
                              </TouchableOpacity>
                              <TextInput
                                style={{
                                  width: 48,
                                  height: "100%",
                                  paddingVertical: 0,
                                  color: C.foreground,
                                  textAlign: "center",
                                  fontSize: 15,
                                  fontWeight: "800",
                                  borderLeftWidth: 1,
                                  borderRightWidth: 1,
                                  borderColor: C.border,
                                }}
                                keyboardType="number-pad"
                                value={qty > 0 ? String(qty) : ""}
                                placeholder="0"
                                placeholderTextColor={C.mutedForeground}
                                onChangeText={(v) =>
                                  updateCreateItem(
                                    idx,
                                    "quantity",
                                    v.replace(/[^0-9]/g, ""),
                                  )
                                }
                                accessibilityLabel={`كمية ${item.drugName}`}
                                selectTextOnFocus
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  updateCreateItem(
                                    idx,
                                    "quantity",
                                    String(Math.max(0, qty - 1)),
                                  )
                                }
                                disabled={qty <= 0}
                                hitSlop={4}
                                accessibilityLabel={`إنقاص كمية ${item.drugName}`}
                                style={{
                                  width: 34,
                                  height: "100%",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  opacity: qty <= 0 ? 0.35 : 1,
                                }}
                              >
                                <Ionicons
                                  name="remove"
                                  size={18}
                                  color={C.primary}
                                />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                    <Text
                      style={{
                        color: C.mutedForeground,
                        fontSize: 11.5,
                        textAlign: "right",
                        marginTop: 10,
                      }}
                    >
                      السعر يُحدَّد عند استلام البضاعة من المورد.
                    </Text>
                  </ScrollView>

                  {/* Actions */}
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      gap: 10,
                      padding: 16,
                      paddingBottom: Platform.OS === "ios" ? 34 : 16,
                      borderTopWidth: 1,
                      borderTopColor: C.border,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setCreateModal(null)}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        backgroundColor: C.card,
                        borderRadius: Radius.control,
                        borderWidth: 1,
                        borderColor: C.border,
                        paddingVertical: 13,
                        alignItems: "center",
                        opacity: submitting ? 0.5 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: C.foreground,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        إلغاء
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSubmitOrder}
                      disabled={submitting || !supplierId}
                      activeOpacity={0.85}
                      style={{
                        flex: 2,
                        backgroundColor:
                          supplierId && !submitting ? C.primary : C.border,
                        borderRadius: Radius.control,
                        paddingVertical: 13,
                        flexDirection: "row-reverse",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="cart" size={16} color="#fff" />
                      )}
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 14,
                        }}
                      >
                        {submitting
                          ? "جاري الإنشاء..."
                          : !supplierId
                            ? "اختر المورد أولاً"
                            : "إنشاء الطلب"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <OrderCreatedModal
        order={createdOrder}
        onClose={() => setCreatedOrder(null)}
        onViewOrders={() => {
          setCreatedOrder(null);
          router.push("/(tabs)/purchases" as any);
        }}
      />
    </View>
  );
}

/**
 * Success after creating a purchase order: what was ordered, from whom, where it
 * will be received, and the next step (prices are entered at receipt).
 */
function OrderCreatedModal({
  order,
  onClose,
  onViewOrders,
}: {
  order: CreatedOrderSummary | null;
  onClose: () => void;
  onViewOrders: () => void;
}) {
  const C = usePalette();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!order || reduceMotion) return;
    scale.setValue(0.6);
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 10,
    }).start();
  }, [order, reduceMotion, scale]);

  const row = (label: string, value: React.ReactNode) => (
    <View
      style={{
        flexDirection: "row-reverse",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        paddingVertical: 9,
      }}
    >
      <Text style={{ color: C.mutedForeground, fontSize: 13.5 }}>{label}</Text>
      {typeof value === "string" ? (
        <Text
          style={{
            flexShrink: 1,
            color: C.foreground,
            fontSize: 14,
            fontWeight: "800",
            textAlign: "left",
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
  const divider = <View style={{ height: 1, backgroundColor: C.border }} />;

  return (
    <Modal
      visible={!!order}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.5)",
          justifyContent: "center",
          paddingHorizontal: 22,
        }}
      >
        {order && (
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: Radius.card,
              padding: 20,
              gap: 16,
              maxWidth: 420,
              width: "100%",
              alignSelf: "center",
            }}
          >
            {/* Header */}
            <View style={{ alignItems: "center", gap: 10 }}>
              <Animated.View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: C.successBg,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale }],
                }}
              >
                <Ionicons name="checkmark" size={34} color={C.success} />
              </Animated.View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text
                  style={{
                    color: C.foreground,
                    fontSize: 19,
                    fontWeight: "900",
                    textAlign: "center",
                  }}
                >
                  تم إنشاء طلب الشراء
                </Text>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 13.5,
                    textAlign: "center",
                  }}
                >
                  الطلب بانتظار الاستلام، ويمكنك متابعته من صفحة المشتريات.
                </Text>
              </View>
            </View>

            {/* Summary */}
            <View
              style={{
                backgroundColor: C.background,
                borderRadius: Radius.control,
                paddingHorizontal: 14,
                paddingVertical: 2,
              }}
            >
              {row("المورد", order.supplierName || "—")}
              {divider}
              {row(
                "الأصناف",
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      color: C.foreground,
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                  >
                    {formatNumber(order.itemCount)} صنف ·{" "}
                    {formatNumber(order.totalUnits)} وحدة
                  </Text>
                  {order.criticalCount > 0 && (
                    <StatusBadge
                      label={`${formatNumber(order.criticalCount)} عاجل`}
                      tone="danger"
                    />
                  )}
                </View>,
              )}
              {divider}
              {row("فرع الاستلام", order.branchName ?? "فرعك الحالي")}
              {divider}
              {row(
                "الحالة",
                <StatusBadge label="قيد الانتظار" tone="warning" />,
              )}
            </View>

            {/* Next step */}
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={C.primary}
              />
              <Text
                style={{
                  flex: 1,
                  color: C.mutedForeground,
                  fontSize: 12.5,
                  textAlign: "right",
                }}
              >
                أدخل أسعار الشراء عند استلام البضاعة من المورد.
              </Text>
            </View>

            {/* Actions — side by side */}
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <AppButton
                label="عرض الطلبات"
                icon="list-outline"
                onPress={onViewOrders}
                style={{ flex: 1.3 }}
              />
              <AppButton
                label="حسناً"
                variant="outline"
                onPress={onClose}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
