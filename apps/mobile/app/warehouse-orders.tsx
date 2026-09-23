import {
  OperationHeading,
  OperationFilters,
  OperationRecord,
  OperationItem,
  OperationChoice,
  operationTone,
} from "../components/OperationDesign";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TextInput, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { request, newIdempotencyKey } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  usePalette,
  Surface,
  AppButton,
  StateBlock,
  StatusBadge,
} from "../components/ui/Kit";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { BranchSelector } from "../components/BranchSelector";
import { Radius } from "../constants/colors";
const names: Record<string, string> = {
  SENT: "بانتظار المذخر",
  REVIEWING: "قيد المراجعة",
  QUOTED: "عرض جاهز",
  APPROVED: "معتمد",
  SHIPPED: "قيد التسليم",
  DELIVERED: "مسلّم",
  CANCELLED: "ملغى",
  REJECTED: "مرفوض",
  PENDING: "قيد الانتظار",
  ACCEPTED: "مقبول",
};
export default function WarehouseOrders() {
  const C = usePalette();
  const { can, features, branchId: own, isAdmin } = useAuth();
  const params = useLocalSearchParams<{ draft?: string; orderId?: string }>();
  const [listPage, setListPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [purchase, setPurchase] = useState<any>(null);
  const [returns, setReturns] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [branch, setBranch] = useState<string | null>(own);
  const [creating, setCreating] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouse, setWarehouse] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, any>>({});
  const [returning, setReturning] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const attempt = useRef({ signature: "", key: "" });
  const generation = useRef(0);
  const allowed = can("canViewWarehouseOrders");
  const manage = can("canCreateWarehouseOrder");
  const label = {
    color: C.foreground,
    textAlign: "right" as const,
    fontSize: 14,
  };
  const input = {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.control,
    padding: 10,
    color: C.foreground,
    backgroundColor: C.input,
    textAlign: "right" as const,
  };
  const load = async (page = 1) => {
    const v = ++generation.current;
    try {
      const d = await request<any>(
        `/warehouses/orders?page=${page}&status=${encodeURIComponent(filter)}`,
      );
      if (v === generation.current) {
        setOrders((previous) =>
          page === 1 ? d.orders : [...previous, ...d.orders],
        );
        setListPage(page);
        setHasMore(d.hasMore);
      }
    } catch (e) {
      if (v === generation.current)
        setError(e instanceof Error ? e.message : "تعذر التحميل");
    }
  };
  const open = async (id: string) => {
    const [d, r] = await Promise.all([
      request<any>(`/warehouses/orders/${id}`),
      request<any>(`/warehouses/orders/${id}/returns`),
    ]);
    setOrder(d.order);
    setPurchase(d.purchase);
    setReturns(r.returns);
    setReturning(false);
    setQuantities({});
    setNote("");
  };
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const begin = async () => {
    const d = await request<any>("/warehouses/directory");
    setWarehouses(d.warehouses);
    setNote("");
    setCreating(true);
    setWarehouse(null);
    setCart({});
    if (params.draft) {
      try {
        const draft = JSON.parse(params.draft);
        setBranch(draft.branchId);
        setCart(
          Object.fromEntries(
            draft.items.map((i: any) => [
              i.barcode,
              { ...i, quantity: String(i.quantity) },
            ]),
          ),
        );
      } catch {
        throw new Error("مسودة الشراء غير صالحة");
      }
    }
  };
  useEffect(() => {
    if (!allowed) return;
    void run(async () => {
      await load();
      if (params.orderId) await open(params.orderId);
      else if (params.draft) await begin();
    });
    return () => {
      generation.current++;
    };
  }, [allowed]);
  useEffect(() => {
    if (!warehouse) return;
    let active = true;
    setCatalog([]);
    const timer = setTimeout(() => {
      request<any>(
        `/warehouses/directory?warehouseId=${warehouse.id}&search=${encodeURIComponent(search)}`,
      )
        .then((d) => {
          if (active) setCatalog(d.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [warehouse, search]);
  const focusState = useRef({ order, creating });
  focusState.current = { order, creating };
  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      void run(async () => {
        await load();
        if (focusState.current.order && !focusState.current.creating)
          await open(focusState.current.order.id);
      });
    }, [allowed, filter]),
  );
  const keyed = (body: any) => {
    const signature = JSON.stringify(body);
    if (attempt.current.signature !== signature)
      attempt.current = { signature, key: newIdempotencyKey() };
    return { ...body, idempotencyKey: attempt.current.key };
  };
  const confirm = (title: string, work: () => Promise<void>) =>
    Alert.alert(title, "راجع الأصناف والكميات والأسعار قبل التأكيد.", [
      { text: "مراجعة", style: "cancel" },
      { text: "تأكيد", onPress: () => run(work) },
    ]);
  const decide = (action: string) =>
    confirm(names[action], async () => {
      await request(`/warehouses/orders/${order.id}`, {
        method: "POST",
        body: JSON.stringify({ action, reason: note }),
      });
      await open(order.id);
      await load();
    });
  const sent = () =>
    confirm("إرسال طلب للمذخر", async () => {
      if (!branch || !warehouse) throw new Error("اختر الفرع والمذخر");
      const items = Object.values(cart);
      if (items.length > 100)
        throw new Error("الحد الأقصى 100 صنف لكل طلب؛ قسّم المختارات.");
      if (
        !items.length ||
        items.some(
          (i) =>
            !Number.isSafeInteger(Number(i.quantity)) ||
            Number(i.quantity) <= 0,
        )
      )
        throw new Error("أدخل كميات صحيحة أكبر من صفر");
      await request("/warehouses/orders", {
        method: "POST",
        body: JSON.stringify(
          keyed({
            branchId: branch,
            warehouseId: warehouse.id,
            items: items.map((i) => ({
              barcode: i.barcode,
              quantity: Number(i.quantity),
            })),
            notes: note,
          }),
        ),
      });
      attempt.current = { signature: "", key: "" };
      setCreating(false);
      setCart({});
      router.setParams({ draft: undefined });
      await load();
    });
  const sendReturn = () =>
    confirm("إرسال طلب الإرجاع", async () => {
      const items = Object.entries(quantities)
        .filter(([, v]) => Number(v) > 0)
        .map(([barcode, v]) => ({ barcode, quantity: Number(v) }));
      if (items.length > 100)
        throw new Error("الحد الأقصى 100 صنف لكل طلب؛ قسّم المختارات.");
      if (!items.length || items.some((i) => !Number.isSafeInteger(i.quantity)))
        throw new Error("حدد كميات إرجاع صحيحة");
      await request(`/warehouses/orders/${order.id}/returns`, {
        method: "POST",
        body: JSON.stringify(keyed({ items, reason: note })),
      });
      attempt.current = { signature: "", key: "" };
      setReturning(false);
      setQuantities({});
      await open(order.id);
      await load();
    });
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title="طلبات المذاخر" fallbackHref="/(tabs)/more" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      >
        {!!error && (
          <Text accessibilityRole="alert" style={{ ...label, color: C.danger }}>
            {error}
          </Text>
        )}
        {busy && <StateBlock loading title="جاري المعالجة…" />}
        {!order && !creating && (
          <>
            <OperationHeading
              title="طلبات التوريد"
              subtitle="من عرض المذخر حتى استلام المواد ومتابعة المرتجعات."
              icon="business-outline"
            >
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                {manage && features.warehouseManagement && (
                  <AppButton
                    compact
                    style={{ flex: 1 }}
                    label="طلب جديد"
                    icon="add-outline"
                    disabled={busy}
                    onPress={() => run(begin)}
                  />
                )}
                <AppButton
                  compact
                  label="تحديث"
                  icon="refresh-outline"
                  variant="outline"
                  disabled={busy}
                  onPress={() => run(load)}
                />
              </View>
            </OperationHeading>
            <OperationFilters
              disabled={busy}
              value={filter}
              onChange={setFilter}
              options={[
                "",
                "SENT",
                "REVIEWING",
                "QUOTED",
                "APPROVED",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
                "REJECTED",
              ].map((value) => ({ value, label: names[value] || "الكل" }))}
            />
            {orders
              .filter((o) => !filter || o.status === filter)
              .map((o) => (
                <OperationRecord
                  key={o.id}
                  icon="document-text-outline"
                  title={o.orderNumber || o.id.slice(0, 8)}
                  subtitle={`${o.warehouse.name} · ${o.branch.name}`}
                  status={o.status}
                  statusLabel={names[o.status] || o.status}
                  date={new Date(o.createdAt).toLocaleDateString("en-GB")}
                  meta={`${o.items.length} أصناف`}
                  disabled={busy}
                  onPress={() => run(() => open(o.id))}
                />
              ))}
            {!busy &&
              !orders.filter((o) => !filter || o.status === filter).length && (
                <StateBlock title="لا توجد طلبات بهذه الحالة" />
              )}
            {hasMore && (
              <AppButton
                compact
                label="تحميل طلبات أقدم"
                variant="outline"
                disabled={busy}
                onPress={() => run(() => load(listPage + 1))}
              />
            )}
          </>
        )}
        {creating && (
          <>
            <OperationHeading
              title="إعداد طلب التوريد"
              subtitle="اختر فرع الاستلام والمذخر ثم أضف الأصناف."
              icon="bag-add-outline"
            >
              <BranchSelector
                selectedBranchId={branch}
                onSelectBranch={setBranch}
                allowAll={false}
                inline
              />
              <Text style={{ ...label, fontSize: 12, fontWeight: "700" }}>
                المذخر
              </Text>
              {warehouses.map((w) => (
                <OperationChoice
                  key={w.id}
                  label={w.name}
                  selected={warehouse?.id === w.id}
                  onPress={() => setWarehouse(w)}
                />
              ))}
            </OperationHeading>
            <Text style={{ ...label, fontSize: 12, color: C.mutedForeground }}>
              الكميات بالباكيت · يعتمد السعر النهائي بعد وصول عرض المذخر.
            </Text>
            <Text style={{ ...label, fontWeight: "800" }}>
              أصناف الطلب ({Object.keys(cart).length})
            </Text>
            {Object.values(cart).map((i) => (
              <Surface key={i.barcode} style={{ gap: 8 }}>
                <OperationItem
                  title={i.name || i.drug?.tradeName || i.barcode}
                  subtitle={i.barcode}
                />
                <Text
                  style={{ ...label, fontSize: 12, color: C.mutedForeground }}
                >
                  الكمية بالباكيت
                </Text>
                <TextInput
                  accessibilityLabel={`كمية ${i.name || i.barcode}`}
                  keyboardType="number-pad"
                  value={i.quantity}
                  onChangeText={(v) =>
                    setCart((p) => ({
                      ...p,
                      [i.barcode]: { ...i, quantity: v },
                    }))
                  }
                  style={input}
                />
                <AppButton
                  compact
                  label="إزالة"
                  variant="outline"
                  onPress={() =>
                    setCart((p) => {
                      const next = { ...p };
                      delete next[i.barcode];
                      return next;
                    })
                  }
                />
              </Surface>
            ))}
            {warehouse && (
              <>
                <TextInput
                  accessibilityLabel="بحث كتالوج المذخر"
                  placeholder="ابحث بالاسم أو الباركود"
                  placeholderTextColor={C.mutedForeground}
                  value={search}
                  onChangeText={setSearch}
                  style={input}
                />
                {catalog.map((i) => (
                  <Surface key={i.id} style={{ gap: 7 }}>
                    <OperationItem
                      title={i.drug.tradeName}
                      subtitle={i.barcode}
                    >
                      <Text
                        style={{
                          ...label,
                          color: C.primary,
                          fontWeight: "800",
                        }}
                      >
                        {i.price.toLocaleString("en-US")} د.ع
                      </Text>
                    </OperationItem>
                    <AppButton
                      compact
                      label={cart[i.barcode] ? "مضاف" : "إضافة للطلب"}
                      variant="outline"
                      disabled={!!cart[i.barcode]}
                      onPress={() =>
                        setCart((p) => ({
                          ...p,
                          [i.barcode]: {
                            ...i,
                            name: i.drug.tradeName,
                            quantity: "1",
                          },
                        }))
                      }
                    />
                  </Surface>
                ))}
              </>
            )}
            <TextInput
              placeholder="ملاحظات الطلب"
              placeholderTextColor={C.mutedForeground}
              style={input}
              value={note}
              onChangeText={setNote}
            />
            <AppButton
              compact
              label="مراجعة وإرسال الطلب"
              disabled={busy || !manage || !warehouse}
              onPress={sent}
            />
          </>
        )}
        {order && (
          <>
            <OperationHeading
              title={order.orderNumber || order.id.slice(0, 8)}
              subtitle={`${order.warehouse.name} · ${order.branch.name}`}
              icon="document-text-outline"
            >
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <StatusBadge
                  label={names[order.status] || order.status}
                  tone={operationTone(order.status)}
                />
                {purchase && (
                  <StatusBadge
                    label={
                      ["COMPLETED", "RECEIVED"].includes(purchase.status)
                        ? "استُلم لدى الصيدلية"
                        : "بانتظار الاستلام"
                    }
                    tone={
                      ["COMPLETED", "RECEIVED"].includes(purchase.status)
                        ? "success"
                        : "neutral"
                    }
                  />
                )}
              </View>
            </OperationHeading>
            <Text style={{ ...label, fontWeight: "800" }}>
              أصناف الطلب · {order.items.length}
            </Text>
            {order.items.map((i: any) => (
              <Surface key={i.id} style={{ gap: 7 }}>
                <OperationItem
                  title={i.drug.tradeName}
                  subtitle={i.drug.barcode}
                >
                  <Text style={{ ...label, fontSize: 12 }}>
                    المطلوب {i.quantity} · المعروض{" "}
                    {i.quotedQuantity ?? i.quantity}
                  </Text>
                  <Text
                    style={{ ...label, color: C.primary, fontWeight: "800" }}
                  >
                    {Number(i.quotedPrice ?? i.unitPrice).toLocaleString(
                      "en-US",
                    )}{" "}
                    د.ع
                  </Text>
                </OperationItem>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <StatusBadge
                    label={
                      (
                        {
                          AVAILABLE: "متوفر",
                          PARTIAL: "متوفر جزئيًا",
                          UNAVAILABLE: "غير متوفر",
                          PENDING: "قيد المراجعة",
                        } as any
                      )[i.status] || "قيد المراجعة"
                    }
                    tone={i.status === "UNAVAILABLE" ? "danger" : "neutral"}
                  />
                  {i.bonusQuantity > 0 && (
                    <StatusBadge
                      label={`+ ${i.bonusQuantity} بونص`}
                      tone="success"
                    />
                  )}
                </View>
                {i.warehouseNote && (
                  <Text style={label}>{i.warehouseNote}</Text>
                )}
                {returning && (
                  <TextInput
                    accessibilityLabel={`إرجاع ${i.drug.tradeName}`}
                    keyboardType="number-pad"
                    placeholder="عدد الباكيتات للإرجاع"
                    placeholderTextColor={C.mutedForeground}
                    value={quantities[i.drug.barcode] || ""}
                    onChangeText={(v) =>
                      setQuantities((p) => ({ ...p, [i.drug.barcode]: v }))
                    }
                    style={input}
                  />
                )}
              </Surface>
            ))}
            {(can("canApproveWarehouseOrder") || can("canReceivePurchase") || can("canReturnWarehouseOrder")) && (
              <>
                {can("canApproveWarehouseOrder") && order.status === "QUOTED" && (
                  <>
                    <AppButton
                      compact
                      label="اعتماد عرض المذخر"
                      disabled={busy}
                      onPress={() => decide("APPROVED")}
                    />
                    <AppButton
                      compact
                      label="رفض العرض"
                      variant="dangerOutline"
                      disabled={busy}
                      onPress={() => decide("REJECTED")}
                    />
                  </>
                )}
                {!purchase || purchase.status === "PENDING"
                  ? ["SENT", "REVIEWING", "QUOTED", "APPROVED"].includes(
                      order.status,
                    ) && (
                      <AppButton
                        compact
                        permission="canApproveWarehouseOrder"
                        label="إلغاء الطلب"
                        disabled={busy}
                        variant="dangerOutline"
                        onPress={() => decide("CANCELLED")}
                      />
                    )
                  : null}
                {purchase?.status === "PENDING" &&
                  ["SHIPPED", "DELIVERED"].includes(order.status) && (
                    <AppButton
                      compact
                      permission="canReceivePurchase"
                      label="استلام المواد"
                      icon="cube-outline"
                      onPress={() =>
                        router.push(`/purchases/${purchase.id}/receive` as any)
                      }
                    />
                  )}
                {can("canReturnWarehouseOrder") && purchase &&
                  ["COMPLETED", "RECEIVED"].includes(purchase.status) &&
                  !returns.some((r) => r.status === "PENDING") && (
                    <AppButton
                      compact
                      label="طلب إرجاع"
                      variant="outline"
                      onPress={() => setReturning(!returning)}
                    />
                  )}
              </>
            )}
            {returning && (
              <>
                <Text style={label}>
                  يتحقق الخادم من الكميات المتبقية في دفعات الاستلام الأصلية.
                  الكميات بالباكيت.
                </Text>
                <TextInput
                  placeholder="سبب الإرجاع"
                  placeholderTextColor={C.mutedForeground}
                  value={note}
                  onChangeText={setNote}
                  style={input}
                />
                <AppButton
                  compact
                  label="مراجعة وإرسال الإرجاع"
                  disabled={busy || !can("canReturnWarehouseOrder")}
                  onPress={sendReturn}
                />
              </>
            )}
            <Text style={{ ...label, fontWeight: "800" }}>
              متابعة المرتجعات
            </Text>
            {returns.map((r) => (
              <Surface key={r.id} style={{ gap: 7 }}>
                <View
                  style={{
                    flexDirection: "row-reverse",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <StatusBadge
                    label={names[r.status] || r.status}
                    tone={operationTone(r.status)}
                  />
                  <Text
                    style={{ ...label, fontSize: 11, color: C.mutedForeground }}
                  >
                    {new Date(r.createdAt).toLocaleDateString("en-GB")}
                  </Text>
                </View>
                {r.items.map((i: any) => (
                  <Text key={i.id} style={label}>
                    {order.items.find((l: any) => l.drug.barcode === i.barcode)
                      ?.drug.tradeName || i.barcode}{" "}
                    · {i.quantity}
                  </Text>
                ))}
                <Text style={label}>
                  القيمة{" "}
                  {r.items
                    .reduce(
                      (s: number, i: any) => s + i.quantity * i.unitPrice,
                      0,
                    )
                    .toLocaleString("en-US")}{" "}
                  د.ع
                </Text>
                {r.creditNoteNumber && (
                  <Text style={label}>إشعار دائن: {r.creditNoteNumber}</Text>
                )}
                <Text style={label}>
                  رصيد لصالح الصيدلية: {r.creditBalance || 0} د.ع · مسترد:{" "}
                  {r.refundedAmount || 0} د.ع
                </Text>
                {can("canReturnWarehouseOrder") &&
                  isAdmin &&
                  ((r.status === "PENDING" && !r.dispatched) ||
                    (r.status === "REJECTED" && !r.restored)) && (
                    <>
                      <TextInput
                        placeholder="مرجع التسليم أو نتيجة فحص المرتجع"
                        placeholderTextColor={C.mutedForeground}
                        style={input}
                        value={note}
                        onChangeText={setNote}
                      />
                      <AppButton
                        compact
                        label={
                          r.status === "PENDING"
                            ? "تأكيد تسليم المرتجع للمذخر"
                            : "تأكيد استعادة المرتجع وفحصه"
                        }
                        disabled={busy}
                        onPress={() =>
                          confirm(
                            "أؤكد الحركة الفعلية وفحص الصلاحية عند إعادة المخزون",
                            async () => {
                              await request(
                                `/warehouses/orders/${order.id}/returns`,
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    returnId: r.id,
                                    action:
                                      r.status === "PENDING"
                                        ? "DISPATCH"
                                        : "RESTORE",
                                    note,
                                    confirmedPresentAndSaleable: true,
                                  }),
                                },
                              );
                              await open(order.id);
                            },
                          )
                        }
                      />
                    </>
                  )}
              </Surface>
            ))}
            <Text style={{ ...label, fontWeight: "800" }}>سجل المتابعة</Text>
            {order.events.map((e: any) => (
              <Text key={e.id} style={{ ...label, fontSize: 12 }}>
                {names[e.type] ||
                  (
                    {
                      CREATED: "إنشاء الطلب",
                      RETURN_REQUESTED: "طلب إرجاع",
                      RETURN_ACCEPTED: "قبول الإرجاع",
                      RETURN_REJECTED: "رفض الإرجاع",
                      RECEIPT_RECONCILED: "توثيق الاستلام",
                    } as any
                  )[e.type] ||
                  "تحديث الطلب"}{" "}
                · {e.actorName || ""} ·{" "}
                {new Date(e.createdAt).toLocaleString("en-GB")}
              </Text>
            ))}
          </>
        )}
        {(order || creating) && (
          <AppButton
            compact
            label="العودة لقائمة الطلبات"
            variant="outline"
            disabled={busy}
            onPress={() => {
              setOrder(null);
              setCreating(false);
              void run(load);
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}
