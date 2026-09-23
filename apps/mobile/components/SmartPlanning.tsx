import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePalette, AppButton } from "./ui/Kit";
import { Radius } from "../constants/colors";
import {
  PlanningItem,
  PlanningSettings,
  numberText as n,
  recentPeriod,
  validateSettings,
} from "../utils/smart-planning";

export function PlanningSettingsSheet({
  value,
  onApply,
  onClose,
}: {
  value: PlanningSettings;
  onApply: (v: PlanningSettings) => void;
  onClose: () => void;
}) {
  const C = usePalette();
  const [draft, setDraft] = useState(value);
  const [fields, setFields] = useState({
    coverageDays: String(value.coverageDays),
    leadDays: String(value.leadDays),
    safetyDays: String(value.safetyDays),
  });
  const [error, setError] = useState("");
  const label = {
    color: C.foreground,
    textAlign: "right" as const,
    fontSize: 13,
    fontWeight: "700" as const,
  };
  const input = {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.control,
    backgroundColor: C.input,
    padding: 12,
    color: C.foreground,
    textAlign: "right" as const,
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#0008",
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ maxHeight: "92%" }}
        >
          <View
            style={{
              backgroundColor: C.card,
              flexShrink: 1,
              borderRadius: Radius.card,
              padding: 18,
              gap: 14,
            }}
          >
            <Text style={{ ...label, fontSize: 18 }}>
              إعدادات التحليل والتغطية
            </Text>
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 14 }}
            >
              <Text style={label}>فترة تحليل المبيعات · أيام مكتملة</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                {[7, 15, 30].map((days) => (
                  <AppButton
                    key={days}
                    label={`${days} يوم`}
                    compact
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() =>
                      setDraft({ ...draft, ...recentPeriod(days) })
                    }
                  />
                ))}
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                {(["from", "to"] as const).map((k) => (
                  <View key={k} style={{ flex: 1, gap: 6 }}>
                    <Text style={label}>{k === "from" ? "من" : "إلى"}</Text>
                    <TextInput
                      accessibilityLabel={
                        k === "from" ? "بداية الفترة" : "نهاية الفترة"
                      }
                      value={draft[k]}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={C.mutedForeground}
                      onChangeText={(v) => setDraft({ ...draft, [k]: v })}
                      style={input}
                      autoCapitalize="none"
                    />
                  </View>
                ))}
              </View>
              {(
                [
                  [
                    "coverageDays",
                    "أريد أن يكفيني المخزون (يوم)",
                    "مدة التغطية المطلوبة بناءً على معدل البيع اليومي.",
                  ],
                  [
                    "leadDays",
                    "مدة وصول الطلب الجديد (يوم)",
                    "الوقت حتى وصول الدواء؛ يكشف العجز قبل الوصول. 0 يعني وصولاً اليوم.",
                  ],
                  [
                    "safetyDays",
                    "مخزون أمان إضافي (يوم)",
                    "احتياطي فوق التغطية المطلوبة. مثال: 4 وحدات يومياً × يومين = 8 وحدات احتياطية.",
                  ],
                ] as const
              ).map(([key, title, help]) => (
                <View key={key} style={{ gap: 6 }}>
                  <Text style={label}>{title}</Text>
                  <TextInput
                    accessibilityLabel={title}
                    keyboardType="number-pad"
                    value={fields[key]}
                    onChangeText={(v) =>
                      setFields({
                        ...fields,
                        [key]: v.replace(/[٠-٩]/g, (c) =>
                          String(c.charCodeAt(0) - 1632),
                        ),
                      })
                    }
                    style={input}
                  />
                  <Text
                    style={{
                      color: C.mutedForeground,
                      textAlign: "right",
                      fontSize: 12,
                      lineHeight: 19,
                    }}
                  >
                    {help}
                  </Text>
                </View>
              ))}
              <Text style={label}>تبدأ التغطية</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                {[false, true].map((arrival) => (
                  <AppButton
                    key={String(arrival)}
                    label={arrival ? "من وصول الطلب" : "من اليوم"}
                    compact
                    variant={
                      draft.fromArrival === arrival ? "primary" : "outline"
                    }
                    style={{ flex: 1 }}
                    onPress={() => setDraft({ ...draft, fromArrival: arrival })}
                  />
                ))}
              </View>
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={{ color: C.danger, textAlign: "right" }}
                >
                  {error}
                </Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <AppButton
                label="تطبيق التحليل"
                icon="options-outline"
                style={{ flex: 2 }}
                onPress={() => {
                  const next = {
                    ...draft,
                    ...Object.fromEntries(
                      Object.entries(fields).map(([k, v]) => [
                        k,
                        v.trim() ? Number(v) : NaN,
                      ]),
                    ),
                  };
                  const error = validateSettings(next);
                  if (error) setError(error);
                  else onApply(next);
                }}
              />
              <AppButton
                label="إلغاء"
                variant="outline"
                style={{ flex: 1 }}
                onPress={onClose}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function PlanningReason({
  row: r,
  settings: s,
}: {
  row: PlanningItem;
  settings: PlanningSettings;
}) {
  const C = usePalette();
  const [open, setOpen] = useState(false);
  const text = {
    color: C.mutedForeground,
    fontSize: 12,
    lineHeight: 21,
    textAlign: "right" as const,
  };
  const line = (label: string, value: string) => (
    <View
      key={label}
      style={{
        flexDirection: "row-reverse",
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ ...text, flex: 1 }}>{label}</Text>
      <Text
        style={{
          color: C.foreground,
          fontWeight: "700",
          fontSize: 12,
          flex: 1,
          textAlign: "left",
        }}
      >
        {value}
      </Text>
    </View>
  );
  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          backgroundColor: C.primaryMuted,
          borderRadius: Radius.control,
          padding: 10,
          flexDirection: "row-reverse",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="calculator-outline" size={17} color={C.primary} />
        <Text
          style={{
            color: C.primary,
            fontWeight: "700",
            flex: 1,
            textAlign: "right",
          }}
        >
          سبب الاقتراح
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={C.primary}
        />
      </TouchableOpacity>
      {open && (
        <View
          style={{
            marginTop: 10,
            backgroundColor: C.background,
            borderRadius: Radius.card,
            borderWidth: 1,
            borderColor: C.border,
            padding: 12,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: C.foreground,
              fontWeight: "800",
              textAlign: "right",
              fontSize: 14,
            }}
          >
            {r.noDemand
              ? "يحتاج قرارك قبل الشراء"
              : "احتياج محسوب من حركة البيع"}
          </Text>
          <Text style={text}>
            {r.noDemand
              ? "لا توجد مبيعات كافية لاقتراح كمية تلقائية. راجع الحاجة الفعلية أو استكمل الحد الأدنى يدوياً."
              : "نراعي المخزون الصالح والوارد المؤكد في موعده والصرف بالأقرب انتهاءً."}
          </Text>
          <View
            style={{
              backgroundColor: C.card,
              padding: 10,
              borderRadius: Radius.control,
            }}
          >
            {line("صافي مبيعات الفترة", `${n(r.netSales)} وحدة`)}
            {line("مبيعات − مرتجعات مرتبطة", `${n(r.sold)} − ${n(r.returned)}`)}
            {line(
              "معدل البيع اليومي",
              `${n(r.netSales)} ÷ ${n(r.observedDays)} = ${n(r.averageDailySales)}`,
            )}
            {line(
              "التغطية المطلوبة",
              `${s.coverageDays} يوم ${s.fromArrival ? "بعد الوصول" : "من اليوم"}`,
            )}
            {line(
              "الوصول المتوقع",
              s.leadDays ? `بعد ${s.leadDays} يوم` : "اليوم",
            )}
            {line(
              "احتياطي الأمان",
              s.safetyDays
                ? `${s.safetyDays} يوم · ${n(s.safetyDays * r.averageDailySales)} وحدة`
                : "دون احتياطي",
            )}
            {line("اقتراح النظام", `${n(r.suggestedQty)} وحدة مخزون`)}
          </View>
          {(r.urgentUnits > 0 ||
            r.expiredUnits > 0 ||
            r.qualityReasons.length > 0) && (
            <View
              style={{
                backgroundColor: C.warningBg,
                borderRadius: Radius.control,
                padding: 10,
                gap: 5,
              }}
            >
              <Text style={{ ...text, color: C.warning, fontWeight: "800" }}>
                ما يحتاج انتباهك
              </Text>
              {r.urgentUnits > 0 && (
                <Text style={text}>
                  عجز قبل الوصول: {n(r.urgentUnits)} وحدة. يحتاج معالجة عاجلة
                  منفصلة، ولا يضاف تلقائياً للطلب العادي.
                </Text>
              )}
              {r.expiredUnits > 0 && (
                <Text style={text}>
                  قد تنتهي صلاحية {n(r.expiredUnits)} وحدة قبل استخدامها ضمن
                  المحاكاة.
                </Text>
              )}
              {r.qualityReasons.map((reason, i) => (
                <Text key={i} style={text}>
                  • {reason}
                </Text>
              ))}
            </View>
          )}
          {r.incoming.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ ...text, fontWeight: "800", color: C.foreground }}>
                الطلبات القادمة
              </Text>
              {r.incoming.map((item, i) => (
                <View
                  key={i}
                  style={{
                    borderTopWidth: 1,
                    borderColor: C.border,
                    paddingTop: 8,
                  }}
                >
                  <Text style={text}>{item.reference}</Text>
                  <Text style={text}>
                    {n(item.quantity)} وحدة · {item.date || "الموعد غير محدد"}
                  </Text>
                  <Text
                    style={{
                      ...text,
                      color: item.confirmed ? C.primary : C.warning,
                    }}
                  >
                    {item.confirmed
                      ? "يراعى حسب موعده وصلاحيته"
                      : "غير مؤكد؛ لا يخصم من الاحتياج"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
