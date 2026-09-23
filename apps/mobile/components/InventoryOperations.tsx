import { Ionicons } from "@expo/vector-icons";
import { prependOperationBatches } from "../utils/operation-batch-selection";
import { BatchBarcodeScanner } from "./BatchBarcodeScanner";
import { readStocktakeReason } from "../services/stocktake-reasons";
import {
  OperationHeading,
  OperationFilters,
  OperationRecord,
  OperationItem,
  OperationChoice,
  operationTone,
} from "./OperationDesign";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
} from "react-native";
import { request, newIdempotencyKey } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  usePalette,
  Surface,
  AppButton,
  StateBlock,
  StatusBadge,
} from "./ui/Kit";
import { ScreenHeader } from "./ui/ScreenHeader";
import { BranchSelector } from "./BranchSelector";
import { Radius } from "../constants/colors";
const n = (v: number) => v.toLocaleString("en-US");
export default function InventoryOperations({
  mode,
}: {
  mode: "stocktake" | "transfers";
}) {
  const C = usePalette();
  const { branchId: own, isAdmin, can } = useAuth();
  const counting = mode === "stocktake";
  const [branch, setBranch] = useState<string | null>(own);
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [lines, setLines] = useState<Record<string, any>>({});
  const [picker, setPicker] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [exactBarcode, setExactBarcode] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<Record<string, any>>(
    {},
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [targets, setTargets] = useState<any[]>([]);
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const version = useRef(0);
  const attempt = useRef({ signature: "", key: "" });
  const allowed = can(counting ? "canDoStocktake" : "canTransferStock");
  const base = "/inventory/" + mode;
  const load = async () => {
    if (!branch || !allowed) return;
    const v = ++version.current;
    setBusy(true);
    setError("");
    try {
      const data = await request<any>(
        `${base}?branchId=${encodeURIComponent(branch)}`,
      );
      if (v === version.current)
        setRows(data[counting ? "stocktakes" : "transfers"]);
    } catch (e) {
      if (v === version.current)
        setError(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      if (v === version.current) setBusy(false);
    }
  };
  useEffect(() => {
    setDetail(null);
    setLines({});
    setCreating(false);
    setPicker(false);
    setSelectedBatches({});
    setScanning(false);
    void load();
    return () => {
      version.current++;
    };
  }, [branch, allowed]);
  useEffect(() => {
    if (!picker || !branch || scanning || !allowed) return;
    let active = true;
    setBatches([]);
    setMore(false);
    setBatchLoading(true);
    setBatchError("");
    const timer = setTimeout(
      () => {
        request<any>(
          `/inventory/operation-batches?branchId=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}&page=${page}${exactBarcode ? "&match=barcode" : ""}`,
          {},
          false,
          { forceRefresh: true },
        )
          .then((d) => {
            if (active) {
              setBatches(d.items);
              setMore(d.hasMore);
            }
          })
          .catch((e) => {
            if (active) setBatchError(e.message || "تعذر تحميل الدفعات");
          })
          .finally(() => {
            if (active) setBatchLoading(false);
          });
      },
      exactBarcode ? 0 : 250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [picker, search, page, branch, scanning, exactBarcode, allowed]);
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const open = async (row: any) =>
    run(async () => {
      if (counting) {
        const d = await request<any>(`${base}/${row.id}`);
        setDetail(d.stocktake);
        setLines(
          Object.fromEntries(
            d.stocktake.items.map((i: any) => [
              i.batchId,
              {
                ...i,
                batch: i.batch,
                actual: String(i.actualQuantity),
                ...readStocktakeReason(i.reason),
              },
            ]),
          ),
        );
      } else setDetail(row);
    });
  const start = () =>
    run(async () => {
      if (!branch) throw new Error("اختر الفرع");
      setLines({});
      if (counting) {
        const d = await request<any>(base, {
          method: "POST",
          body: JSON.stringify({ branchId: branch }),
        });
        const full = await request<any>(`${base}/${d.stocktake.id}`);
        setDetail(full.stocktake);
        setLines(
          Object.fromEntries(
            full.stocktake.items.map((i: any) => [
              i.batchId,
              {
                ...i,
                batch: i.batch,
                actual: String(i.actualQuantity),
                ...readStocktakeReason(i.reason),
              },
            ]),
          ),
        );
      } else {
        const d = await request<any>(
          `${base}?branchId=${branch}&type=destinations`,
        );
        setTargets(d.branches);
        setTarget("");
        setCreating(true);
      }
    });
  const save = (complete: boolean) =>
    run(async () => {
      const values = Object.values(lines);
      if (!values.length) throw new Error("أضف الدفعات أولاً");
      if (
        values.some(
          (l) =>
            !l.actual.trim() ||
            !Number.isSafeInteger(Number(l.actual)) ||
            Number(l.actual) < (counting ? 0 : 1),
        )
      )
        throw new Error("أدخل كمية صحيحة لكل دفعة");
      if (counting) {
        const saved = await request<any>(`${base}/${detail.id}`, {
          method: "PUT",
          body: JSON.stringify({
            status: complete ? "COMPLETED" : "PENDING",
            items: values.map((l) => ({
              batchId: l.batch.id,
              systemQuantity: l.systemQuantity,
              actualQuantity: Number(l.actual),
              reason: l.reason,
              reasonCode: l.reasonCode || "UNKNOWN",
            })),
          }),
        });
        Alert.alert(
          "الجرد",
          saved.stocktake?.status === "REVIEW"
            ? "أُرسل العجز إلى المدير؛ الكميات لم تتغير بعد."
            : complete
              ? "تم اعتماد الكميات."
              : "تم حفظ المسودة.",
        );
        setDetail(null);
      } else {
        if (!target) throw new Error("اختر فرع الاستلام");
        const body = {
          fromBranchId: branch,
          toBranchId: target,
          items: values.map((l) => ({
            batchId: l.batch.id,
            quantity: Number(l.actual),
          })),
        };
        const signature = JSON.stringify(body);
        if (attempt.current.signature !== signature)
          attempt.current = { signature, key: newIdempotencyKey() };
        await request(base, {
          method: "POST",
          body: JSON.stringify({
            ...body,
            idempotencyKey: attempt.current.key,
          }),
        });
        attempt.current = { signature: "", key: "" };
        setCreating(false);
      }
      setLines({});
      await load();
    });
  const confirm = (title: string, work: () => void) =>
    Alert.alert(
      title,
      counting
        ? "إذا وُجد عجز يُرسل الجرد إلى المدير قبل تعديل المخزون وتسجيل المصروف. دون عجز تُعتمد الكميات مباشرة."
        : "راجع الدفعات والكميات. سيُحدّث المخزون عند التأكيد.",
      [
        { text: "مراجعة", style: "cancel" },
        { text: "تأكيد", onPress: work },
      ],
    );
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
  const drugKey = (batch: any) => batch.inventory.drugId;
  const selectedDrug = Object.values(selectedBatches)[0]?.inventory.drugId;
  const available = batches.filter((b) => !lines[b.id]);
  const groupDrug =
    selectedDrug ||
    (available.length &&
    available.every((b) => drugKey(b) === drugKey(available[0]))
      ? drugKey(available[0])
      : null);
  const visibleGroup = groupDrug
    ? available.filter((b) => drugKey(b) === groupDrug)
    : [];
  const openBatchPicker = (camera: boolean) => {
    setSelectedBatches({});
    setSearch("");
    setExactBarcode(false);
    setPage(1);
    setScanning(camera);
    setPicker(true);
  };
  const toggleBatch = (batch: any) => {
    if (lines[batch.id] || (selectedDrug && selectedDrug !== drugKey(batch)))
      return;
    setSelectedBatches((previous) => {
      const currentDrug = Object.values(previous)[0]?.inventory.drugId;
      if (currentDrug && currentDrug !== drugKey(batch)) return previous;
      const next = { ...previous };
      if (next[batch.id]) delete next[batch.id];
      else next[batch.id] = batch;
      return next;
    });
  };
  const addSelectedBatches = () => {
    setLines((previous) =>
      prependOperationBatches(previous, Object.values(selectedBatches)),
    );
    setSelectedBatches({});
    setPicker(false);
  };
  const editing = creating || (detail?.status === "PENDING" && counting);
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader
        title={counting ? "جرد المخزون" : "التحويلات بين الفروع"}
        fallbackHref="/(tabs)/more"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      >
        <BranchSelector
          selectedBranchId={branch}
          onSelectBranch={setBranch}
          allowAll={false}
          hideIfSingle
          disabled={!!detail || creating || busy}
        />
        {!detail && !creating && (
          <>
            <OperationHeading
              icon={counting ? "clipboard-outline" : "swap-horizontal-outline"}
              title={counting ? "مراجعة رصيدك الفعلي" : "مخزونك بين الفروع"}
              subtitle={
                counting
                  ? "عدّ الدفعات وراجع الفروقات قبل الاعتماد."
                  : "تابع الإرسال والاستلام من مكان واحد."
              }
            >
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <AppButton
                  compact
                  style={{ flex: 1 }}
                  label={counting ? "جرد جديد" : "تحويل جديد"}
                  icon="add-outline"
                  onPress={start}
                  disabled={!branch || busy || !allowed}
                />
                <AppButton
                  compact
                  label="تحديث"
                  icon="refresh-outline"
                  variant="outline"
                  onPress={load}
                  disabled={busy}
                />
              </View>
            </OperationHeading>
            <OperationFilters
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                "",
                counting ? "PENDING" : "IN_TRANSIT",
                ...(counting ? ["REVIEW"] : []),
                "COMPLETED",
              ].map((value) => ({
                value,
                label:
                  value === ""
                    ? "الكل"
                    : value === "REVIEW"
                      ? "للمراجعة"
                      : value === "COMPLETED"
                        ? "مكتمل"
                        : counting
                          ? "مسودات"
                          : "قيد النقل",
                count: rows.filter((r) => !value || r.status === value).length,
              }))}
            />
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ ...label, color: C.danger }}>
            {error}
          </Text>
        )}
        {busy && <StateBlock loading title="جاري المعالجة…" />}
        {editing && (
          <>
            <OperationHeading
              icon={counting ? "clipboard-outline" : "swap-horizontal-outline"}
              title={counting ? "تفاصيل جلسة الجرد" : "إعداد التحويل"}
              subtitle={
                counting
                  ? "الحفظ كمسودة لا يغيّر المخزون. الملاحظة اختيارية؛ العجز يُرسل إلى المدير قبل تعديل المخزون."
                  : "اختر الوجهة والدفعات؛ تُخصم الكميات بعد تأكيد الإرسال."
              }
            >
              <Text style={{ ...label, fontWeight: "700" }}>
                الدفعات المختارة: {n(Object.keys(lines).length)}
              </Text>
              {creating && (
                <>
                  <Text
                    style={{ ...label, fontSize: 12, color: C.mutedForeground }}
                  >
                    فرع الاستلام
                  </Text>
                  {targets.map((t) => (
                    <OperationChoice
                      key={t.id}
                      label={t.name}
                      selected={target === t.id}
                      onPress={() => setTarget(t.id)}
                    />
                  ))}
                </>
              )}
            </OperationHeading>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <AppButton
                compact
                style={{ flex: 1 }}
                label="إضافة دفعات"
                icon="add-outline"
                variant="outline"
                onPress={() => openBatchPicker(false)}
                disabled={busy}
              />
              <AppButton
                compact
                label="مسح باركود"
                icon="barcode-outline"
                onPress={() => openBatchPicker(true)}
                disabled={busy}
              />
            </View>
            {Object.values(lines).map((l) => (
              <Surface key={l.batch.id} style={{ gap: 8 }}>
                <OperationItem
                  title={l.batch.inventory.drug.tradeName}
                  subtitle={`دفعة ${l.batch.batchNumber}`}
                >
                  <Text style={{ ...label, fontSize: 12 }}>
                    الرصيد {n(l.systemQuantity)}
                  </Text>
                  <Text
                    style={{ ...label, fontSize: 12, color: C.mutedForeground }}
                  >
                    الصلاحية {String(l.batch.expiryDate).slice(0, 10)}
                  </Text>
                </OperationItem>
                <Text style={{ ...label, fontSize: 12, fontWeight: "700" }}>
                  {counting ? "العدد الفعلي" : "الكمية المراد تحويلها"}
                </Text>
                <TextInput
                  accessibilityLabel="الكمية الفعلية"
                  placeholder={counting ? "العدد الفعلي" : "كمية التحويل"}
                  placeholderTextColor={C.mutedForeground}
                  keyboardType="number-pad"
                  style={input}
                  value={l.actual}
                  onChangeText={(v) =>
                    setLines((p) => ({
                      ...p,
                      [l.batch.id]: {
                        ...l,
                        actual: v,
                        reasonCode:
                          Number(v) >= l.systemQuantity &&
                          l.reasonCode === "DAMAGE"
                            ? "UNKNOWN"
                            : l.reasonCode,
                      },
                    }))
                  }
                />
                {counting && (
                  <View style={{ gap: 8 }}>
                    {l.actual !== "" &&
                      Number(l.actual) !== l.systemQuantity && (
                        <>
                          <Text style={label}>
                            {Number(l.actual) < l.systemQuantity
                              ? "عجز الجرد"
                              : "فائض الجرد"}{" "}
                          </Text>
                          {Number(l.actual) < l.systemQuantity && (
                            <OperationChoice
                              label="هذا النقص ناتج عن تلف مؤكد"
                              selected={l.reasonCode === "DAMAGE"}
                              onPress={() =>
                                setLines((p) => ({
                                  ...p,
                                  [l.batch.id]: {
                                    ...l,
                                    reasonCode:
                                      l.reasonCode === "DAMAGE"
                                        ? "UNKNOWN"
                                        : "DAMAGE",
                                  },
                                }))
                              }
                            />
                          )}
                          {l.reasonCode === "DAMAGE" &&
                            Number(l.actual) < l.systemQuantity && (
                              <Text style={label}>
                                عند اعتماد المدير تُسجّل قيمة هذا العجز كمصروف
                                تلف مؤكد.
                              </Text>
                            )}
                        </>
                      )}
                    <TextInput
                      accessibilityLabel="ملاحظة الجرد الاختيارية"
                      placeholder="ملاحظة الجرد (اختياري)"
                      placeholderTextColor={C.mutedForeground}
                      style={input}
                      value={l.reason}
                      onChangeText={(v) =>
                        setLines((p) => ({
                          ...p,
                          [l.batch.id]: { ...l, reason: v },
                        }))
                      }
                    />
                  </View>
                )}
                <AppButton
                  compact
                  label="إزالة من القائمة"
                  variant="outline"
                  onPress={() =>
                    setLines((p) => {
                      const next = { ...p };
                      delete next[l.batch.id];
                      return next;
                    })
                  }
                />
              </Surface>
            ))}
            {counting && (
              <AppButton
                compact
                label="حفظ المسودة"
                variant="outline"
                disabled={busy}
                onPress={() => save(false)}
              />
            )}
            <AppButton
              compact
              label={
                counting ? "إنهاء العد وإرسال النتيجة" : "مراجعة وإرسال التحويل"
              }
              disabled={busy}
              onPress={() =>
                confirm(counting ? "إنهاء العد" : "إرسال التحويل", () =>
                  save(true),
                )
              }
            />
            {counting && (
              <AppButton
                compact
                label="إلغاء جلسة الجرد"
                variant="dangerOutline"
                disabled={busy}
                onPress={() =>
                  confirm("إلغاء الجرد", () =>
                    run(async () => {
                      await request(`${base}/${detail.id}`, {
                        method: "DELETE",
                      });
                      setDetail(null);
                      await load();
                    }),
                  )
                }
              />
            )}
          </>
        )}
        {detail && !editing && (
          <Surface style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text style={{ ...label, fontWeight: "800" }}>
                تفاصيل {counting ? "الجرد" : "التحويل"} ·{" "}
                {detail.documentNumber || "—"}
              </Text>
              <StatusBadge
                label={
                  (
                    {
                      PENDING: "مسودة",
                      REVIEW: "بانتظار اعتماد المدير",
                      IN_TRANSIT: "قيد النقل",
                      COMPLETED: "مكتمل",
                      CANCELLED: "ملغى",
                    } as any
                  )[detail.status] || detail.status
                }
                tone={operationTone(detail.status)}
              />
            </View>
            {counting && detail.status === "REVIEW" && (
              <>
                <Text style={label}>
                  الكمية لم تُعدّل بعد. راجع العدد والعجز قبل الاعتماد. إذا تغير
                  المخزون منذ العد، اطلب إعادة العد.
                </Text>
                {isAdmin && (
                  <>
                    <AppButton
                      label="اعتماد العجز"
                      loading={busy}
                      onPress={() =>
                        Alert.alert(
                          "اعتماد العجز",
                          "ستُحدّث الكمية ويُسجّل العجز بالتكلفة كمصروف، والتلف المحدد كمصروف تلف. هل تؤكد؟",
                          [
                            { text: "إلغاء", style: "cancel" },
                            {
                              text: "اعتماد",
                              onPress: () =>
                                void run(async () => {
                                  await request(`${base}/${detail.id}`, {
                                    method: "PUT",
                                    body: JSON.stringify({ action: "APPROVE" }),
                                  });
                                  setDetail(null);
                                  await load();
                                }),
                            },
                          ],
                        )
                      }
                    />
                    <AppButton
                      label="طلب إعادة العد"
                      variant="outline"
                      loading={busy}
                      onPress={() =>
                        Alert.alert(
                          "إعادة العد",
                          "ستُفتح مسودة جديدة للعد، ويُحفظ العد السابق في سجل المراجعة دون تعديل المخزون.",
                          [
                            { text: "إلغاء", style: "cancel" },
                            {
                              text: "تأكيد",
                              onPress: () =>
                                void run(async () => {
                                  await request(`${base}/${detail.id}`, {
                                    method: "PUT",
                                    body: JSON.stringify({ action: "RECOUNT" }),
                                  });
                                  setDetail(null);
                                  await load();
                                }),
                            },
                          ],
                        )
                      }
                    />
                  </>
                )}
              </>
            )}
            {detail.items.map((i: any) => (
              <View
                key={i.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: C.border,
                  paddingTop: 12,
                }}
              >
                <OperationItem
                  title={
                    counting
                      ? i.batch.inventory.drug.tradeName
                      : i.drug.tradeName
                  }
                  subtitle={`دفعة ${counting ? i.batch.batchNumber : i.batchNumber}`}
                >
                  <Text
                    style={{ ...label, color: C.primary, fontWeight: "700" }}
                  >
                    الكمية {n(counting ? i.actualQuantity : i.quantity)}
                  </Text>
                  {counting && (
                    <Text
                      style={{
                        ...label,
                        fontSize: 12,
                        color: C.mutedForeground,
                      }}
                    >
                      المسجل {n(i.systemQuantity || 0)} · الفرق{" "}
                      {n(i.difference || 0)} · قيمة العجز{" "}
                      {n(
                        Math.max(0, -(i.difference || 0)) * (i.costPrice || 0),
                      )}{" "}
                      د.ع
                    </Text>
                  )}
                  {counting && i.reason && (
                    <Text
                      style={{
                        ...label,
                        fontSize: 12,
                        color: C.mutedForeground,
                      }}
                    >
                      {i.reason}
                    </Text>
                  )}
                </OperationItem>
              </View>
            ))}
            {!counting &&
              detail.status === "IN_TRANSIT" &&
              detail.toBranchId === branch && (
                <AppButton
                  compact
                  label="تأكيد الاستلام"
                  disabled={busy}
                  onPress={() =>
                    confirm("استلام التحويل", () =>
                      run(async () => {
                        await request(`${base}/${detail.id}/receive`, {
                          method: "PUT",
                        });
                        setDetail(null);
                        await load();
                      }),
                    )
                  }
                />
              )}
          </Surface>
        )}
        {(detail || creating) && (
          <AppButton
            compact
            label="العودة للقائمة"
            variant="outline"
            disabled={busy}
            onPress={() => {
              const leave = () => {
                setDetail(null);
                setCreating(false);
                void load();
              };
              if (editing)
                Alert.alert("مغادرة التعديلات؟", "أي تعديلات لم تحفظ ستُفقد.", [
                  { text: "البقاء", style: "cancel" },
                  { text: "مغادرة", onPress: leave },
                ]);
              else leave();
            }}
          />
        )}
        {!detail &&
          !creating &&
          !busy &&
          rows
            .filter((r) => !statusFilter || r.status === statusFilter)
            .map((r) => (
              <OperationRecord
                key={r.id}
                disabled={busy}
                icon={
                  counting ? "clipboard-outline" : "swap-horizontal-outline"
                }
                title={
                  counting
                    ? `جلسة جرد · ${r.documentNumber || "—"}`
                    : `${r.documentNumber || "—"} · ${r.toBranch.name}`
                }
                subtitle={
                  counting
                    ? "مراجعة الدفعات والكميات"
                    : `من ${r.fromBranch.name} إلى ${r.toBranch.name}`
                }
                status={r.status}
                statusLabel={
                  (
                    {
                      PENDING: "مسودة",
                      REVIEW: "بانتظار اعتماد المدير",
                      IN_TRANSIT: "قيد النقل",
                      COMPLETED: "مكتمل",
                      CANCELLED: "ملغى",
                    } as any
                  )[r.status] || r.status
                }
                date={new Date(r.createdAt).toLocaleDateString("en-GB")}
                onPress={() => open(r)}
              />
            ))}
        {!detail &&
          !creating &&
          !busy &&
          !rows.filter((r) => !statusFilter || r.status === statusFilter)
            .length && (
            <StateBlock
              title="لا توجد سجلات"
              message="اختر الفرع أو ابدأ عملية جديدة."
            />
          )}
      </ScrollView>
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() =>
          scanning ? setScanning(false) : setPicker(false)
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor: C.background,
            padding: 16,
            paddingTop: 40,
            gap: 12,
          }}
        >
          {scanning ? (
            <BatchBarcodeScanner
              onClose={() => setScanning(false)}
              onRead={(barcode) => {
                setSelectedBatches({});
                setSearch(barcode);
                setExactBarcode(true);
                setPage(1);
                setScanning(false);
              }}
            />
          ) : (
            <>
              <OperationItem
                title="اختيار دفعة"
                subtitle="ابحث بالاسم أو الباركود ثم اختر الدفعة المطلوبة."
                icon="search-outline"
              />
              <TextInput
                accessibilityLabel="بحث الدفعات"
                placeholder="اسم الدواء أو الباركود"
                placeholderTextColor={C.mutedForeground}
                style={input}
                value={search}
                onChangeText={(v) => {
                  setPage(1);
                  setSearch(v);
                  setSelectedBatches({});
                  setExactBarcode(false);
                }}
              />
              <AppButton
                compact
                label="مسح الباركود بالكاميرا"
                icon="barcode-outline"
                variant="outline"
                onPress={() => setScanning(true)}
                disabled={!allowed}
              />
              {batchLoading && (
                <StateBlock loading title="جاري البحث عن الدفعات…" />
              )}
              {!batchLoading && !batchError && !batches.length && (
                <StateBlock
                  title="لا توجد دفعات مطابقة"
                  message="تحقق من الفرع والباركود، أو ابحث باسم الدواء."
                />
              )}
              {!!batchError && (
                <Text
                  accessibilityRole="alert"
                  style={{ ...label, color: C.danger }}
                >
                  {batchError}
                </Text>
              )}
              <Text
                style={{ ...label, fontSize: 12, color: C.mutedForeground }}
              >
                حدد دفعة أو أكثر للدواء نفسه. لكل دفعة عدد مستقل، والدفعات
                المضافة سابقًا محفوظة.
              </Text>
              {visibleGroup.length > 1 && (
                <AppButton
                  compact
                  variant="outline"
                  label="تحديد دفعات هذا الدواء في الصفحة"
                  onPress={() =>
                    setSelectedBatches((previous) => ({
                      ...previous,
                      ...Object.fromEntries(visibleGroup.map((b) => [b.id, b])),
                    }))
                  }
                />
              )}
              {Object.keys(selectedBatches).length > 0 && (
                <AppButton
                  compact
                  variant="outline"
                  label="مسح التحديد"
                  onPress={() => setSelectedBatches({})}
                />
              )}
              <ScrollView contentContainerStyle={{ gap: 10 }}>
                {batches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: !!selectedBatches[b.id] || !!lines[b.id],
                      disabled:
                        !!lines[b.id] ||
                        !!(selectedDrug && selectedDrug !== drugKey(b)),
                    }}
                    disabled={
                      !!lines[b.id] ||
                      !!(selectedDrug && selectedDrug !== drugKey(b))
                    }
                    onPress={() => toggleBatch(b)}
                  >
                    <Surface
                      style={{
                        borderColor: selectedBatches[b.id]
                          ? C.primary
                          : C.border,
                        opacity:
                          selectedDrug && selectedDrug !== drugKey(b) ? 0.5 : 1,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Ionicons
                          name={
                            selectedBatches[b.id] || lines[b.id]
                              ? "checkbox"
                              : "square-outline"
                          }
                          size={22}
                          color={C.primary}
                        />
                        <Text style={label}>
                          {lines[b.id]
                            ? "مضافة سابقًا"
                            : selectedBatches[b.id]
                              ? "محددة للإضافة"
                              : "تحديد الدفعة"}
                        </Text>
                      </View>
                      <OperationItem
                        title={b.inventory.drug.tradeName}
                        subtitle={`دفعة ${b.batchNumber}`}
                      >
                        <Text
                          style={{
                            ...label,
                            color: C.primary,
                            fontWeight: "700",
                          }}
                        >
                          المتاح {n(b.quantity)}
                        </Text>
                        <Text
                          style={{
                            ...label,
                            fontSize: 12,
                            color: C.mutedForeground,
                          }}
                        >
                          الصلاحية {String(b.expiryDate).slice(0, 10)}
                        </Text>
                      </OperationItem>
                    </Surface>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <AppButton
                label={`إضافة المحدد (${Object.keys(selectedBatches).length})`}
                disabled={!Object.keys(selectedBatches).length || batchLoading}
                onPress={addSelectedBatches}
              />
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <AppButton
                  compact
                  label="التالي"
                  disabled={!more || batchLoading}
                  onPress={() => setPage((p) => p + 1)}
                />
                <AppButton
                  compact
                  label="السابق"
                  disabled={page === 1 || batchLoading}
                  onPress={() => setPage((p) => p - 1)}
                />
                <AppButton
                  compact
                  label="إغلاق"
                  variant="outline"
                  onPress={() => setPicker(false)}
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}
