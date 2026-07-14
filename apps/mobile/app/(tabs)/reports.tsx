import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Text as SvgText,
  Rect,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { apiService } from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { managerPalette, Radius } from "../../constants/colors";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { BranchSelector } from "../../components/BranchSelector";
import { useSyncStatus } from "../../context/SyncContext";
import { formatDate } from "../../utils/date";

const { width: SCREEN_W } = Dimensions.get("window");

type Period = "daily" | "weekly" | "monthly";
const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "يومي" },
  { key: "weekly", label: "أسبوعي" },
  { key: "monthly", label: "شهري" },
];

// ── Smooth Line Chart ──────────────────────────────────────────────────────────
interface ChartPoint {
  label: string;
  value: number;
}

const SVG_PAD_H = 20; // horizontal inner padding inside SVG
const SVG_PAD_T = 14; // top padding (room for peak dot)
const SVG_PAD_B = 28; // bottom padding for x-axis labels
const SVG_LINE_H = 140; // height of the curve drawing area

function catmullRomPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function SmoothLineChart({
  data,
  color,
  isDark,
  period,
}: {
  data: ChartPoint[];
  color: string;
  isDark: boolean;
  period: Period;
}) {
  const C = managerPalette(isDark);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Reset selection when data changes (period or branch switch)
  useEffect(() => {
    setSelectedIdx(null);
  }, [data]);

  const svgW = SCREEN_W - 40;
  const curveW = svgW - SVG_PAD_H * 2;
  const svgH = SVG_PAD_T + SVG_LINE_H + SVG_PAD_B;
  const baseY = SVG_PAD_T + SVG_LINE_H;

  if (data.length < 2) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const maxIdx = data.reduce(
    (mi, d, i, arr) => (d.value > arr[mi].value ? i : mi),
    0,
  );
  const activeIdx =
    selectedIdx !== null && selectedIdx < data.length ? selectedIdx : maxIdx;

  const pts = data.map((d, i) => ({
    x: SVG_PAD_H + (i / (data.length - 1)) * curveW,
    y: SVG_PAD_T + (1 - d.value / max) * SVG_LINE_H,
  }));

  const linePath = catmullRomPath(pts);
  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`;
  const step = Math.max(1, Math.ceil(data.length / 8));

  const handleTouchX = (locationX: number) => {
    let nearest = 0,
      minDist = Infinity;
    pts.forEach((pt, i) => {
      const dist = Math.abs(pt.x - locationX);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    setSelectedIdx(nearest);
  };

  const activePt = pts[activeIdx];
  const activeData = data[activeIdx];

  // Tooltip dimensions
  const tipValue = activeData.value.toLocaleString("en-US") + " د.ع";
  const tipW = Math.max(68, tipValue.length * 7 + 16);
  const tipH = 38;
  const tipX = Math.min(
    Math.max(activePt.x - tipW / 2, SVG_PAD_H - 4),
    svgW - SVG_PAD_H - tipW + 4,
  );
  const tipY = Math.max(2, activePt.y - tipH - 10);

  return (
    <View>
      <Svg width={svgW} height={svgH}>
        <Defs>
          <LinearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.35" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Gradient fill */}
        <Path d={fillPath} fill="url(#curveGrad)" />

        {/* Smooth curve */}
        <Path
          d={linePath}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />

        {/* Vertical dashed indicator */}
        <Path
          d={`M ${activePt.x.toFixed(2)} ${activePt.y.toFixed(2)} L ${activePt.x.toFixed(2)} ${baseY}`}
          stroke={color}
          strokeWidth={1.2}
          strokeOpacity={0.45}
          strokeDasharray="4,3"
        />

        {/* Active dot with halo */}
        <Circle
          cx={activePt.x}
          cy={activePt.y}
          r={11}
          fill={color}
          fillOpacity={0.15}
        />
        <Circle cx={activePt.x} cy={activePt.y} r={5.5} fill={color} />
        <Circle cx={activePt.x} cy={activePt.y} r={2.5} fill="#fff" />

        {/* Tooltip background */}
        <Rect
          x={tipX}
          y={tipY}
          width={tipW}
          height={tipH}
          rx={8}
          ry={8}
          fill={color}
        />
        {/* Tooltip arrow (small triangle) */}
        <Path
          d={`M ${activePt.x - 5} ${tipY + tipH} L ${activePt.x + 5} ${tipY + tipH} L ${activePt.x} ${tipY + tipH + 7} Z`}
          fill={color}
        />
        {/* Tooltip value */}
        <SvgText
          x={tipX + tipW / 2}
          y={tipY + 15}
          fontSize={11}
          fill="#fff"
          textAnchor="middle"
          fontWeight="700"
        >
          {tipValue}
        </SvgText>
        {/* Tooltip label */}
        <SvgText
          x={tipX + tipW / 2}
          y={tipY + 29}
          fontSize={9}
          fill="rgba(255,255,255,0.82)"
          textAnchor="middle"
        >
          {activeData.label}
        </SvgText>

        {/* X-axis labels — active one is highlighted */}
        {pts.map((pt, i) => {
          const show = i % step === 0 || i === data.length - 1;
          const isActive = i === activeIdx;
          const isDaily = period === "daily";
          return show ? (
            <SvgText
              key={i}
              x={pt.x}
              y={svgH - 6}
              fontSize={13}
              fill={isActive ? color : C.mutedForeground}
              textAnchor="middle"
              fontWeight={isActive || isDaily ? "700" : "400"}
            >
              {data[i].label}
            </SvgText>
          ) : null;
        })}
      </Svg>

      {/* Transparent touch overlay — sits on top, captures drag + tap */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: SVG_PAD_B,
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => handleTouchX(e.nativeEvent.locationX)}
        onResponderMove={(e) => handleTouchX(e.nativeEvent.locationX)}
      />
    </View>
  );
}

// ── KPI chip (small pill) ──────────────────────────────────────────────────────
function KpiChip({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 8,
        backgroundColor: bg,
        borderRadius: Radius.sm,
        padding: 12,
      }}
    >
      <View
        style={{ backgroundColor: `${color}20`, borderRadius: Radius.xs, padding: 6 }}
      >
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color, fontSize: 13, fontWeight: "800", textAlign: "right" }}
        >
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </Text>
        <Text
          style={{
            color: `${color}AA`,
            fontSize: 10,
            fontWeight: "500",
            textAlign: "right",
            marginTop: 1,
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

// ── Reports screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const { isDarkMode } = useTheme();
  const { isPharmacist, branchId: authBranchId } = useAuth();
  const { triggerSync } = useSyncStatus();
  const router = useRouter();
  const C = managerPalette(isDarkMode);

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("daily");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(
    authBranchId,
  );

  // Outlined card matching the manager home — light surface, soft tinted border.
  const card = (accent: string) => ({
    backgroundColor: C.card,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: `${accent}33`,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  });

  const fetchReport = useCallback(async () => {
    try {
      const data = await apiService.getReports(
        period,
        selectedBranch ?? undefined,
      );
      setReport(data);
    } catch (err) {
      console.error("ReportsScreen:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, selectedBranch]);

  useEffect(() => {
    setLoading(true);
    fetchReport();
  }, [fetchReport]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    triggerSync("stats");
    fetchReport();
  }, [fetchReport, triggerSync]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!Array.isArray(report?.chart)) return [];
    if (period === "daily") {
      // Server returns hourly data with pre-built Arabic label
      return report.chart.map((item: any) => ({
        label: item.label ?? "",
        value: item.amount ?? 0,
      }));
    }
    const opts: Intl.DateTimeFormatOptions = { day: "numeric" };
    return report.chart.map((item: any) => ({
      label: item.date ? formatDate(item.date, opts) : "",
      value: item.amount ?? 0,
    }));
  }, [report, period]);

  const bestDay = useMemo(
    () =>
      chartData.length === 0
        ? null
        : chartData.reduce((b, c) => (c.value > b.value ? c : b)),
    [chartData],
  );

  const avgSale = useMemo(() => {
    const t = report?.transactions ?? 0,
      r = report?.revenue ?? 0;
    return t > 0 ? Math.round(r / t) : 0;
  }, [report]);

  const profitMargin = useMemo(() => {
    const r = report?.revenue ?? 0,
      p = report?.profit ?? 0;
    return r > 0 ? (p / r) * 100 : 0;
  }, [report]);

  // Profit bar: what fraction of revenue is kept as profit
  const profitBarPct = useMemo(() => {
    const r = report?.revenue ?? 0,
      p = report?.profit ?? 0;
    return r > 0 ? Math.max(0, Math.min(1, p / r)) : 0;
  }, [report]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";
  const profit = report?.profit ?? 0;
  const profitPositive = profit >= 0;
  const profitColor = profitPositive ? C.success : C.danger;
  const profitBg = profitPositive ? C.successBg : C.dangerBg;

  // All hooks called — safe to branch
  if (isPharmacist) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <EmptyState
          icon="lock-closed"
          title="لا تملك صلاحية الوصول"
          subtitle="هذه الصفحة مخصصة للمدير فقط"
          actionLabel="رجوع"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}
      >
        <View
          style={{
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: C.mutedForeground,
                fontSize: 12,
                textAlign: "right",
                marginBottom: 2,
              }}
            >
              {formatDate(new Date(), {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Text
              style={{
                color: C.foreground,
                fontSize: 23,
                fontWeight: "900",
                textAlign: "right",
              }}
            >
              التقارير المالية
            </Text>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.push("/reports/financial" as any)}
              activeOpacity={0.85}
              style={{
                width: 48,
                height: 48,
                borderRadius: Radius.sm,
                backgroundColor: C.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="stats-chart" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/reports/employees" as any)}
              activeOpacity={0.85}
              style={{
                width: 48,
                height: 48,
                borderRadius: Radius.sm,
                backgroundColor: C.primaryMuted,
                borderWidth: 1.5,
                borderColor: `${C.primary}33`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="people-outline" size={22} color={C.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Period segmented control ───────────────────────────────────── */}
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row-reverse",
            backgroundColor: C.card,
            borderRadius: Radius.sm,
            borderWidth: 1.5,
            borderColor: `${C.primary}33`,
            padding: 4,
            gap: 4,
          }}
        >
          {PERIODS.map(({ key, label }) => {
            const sel = period === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setPeriod(key)}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: Radius.xs,
                  alignItems: "center",
                  backgroundColor: sel ? C.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: sel ? "800" : "600",
                    color: sel ? "#fff" : C.mutedForeground,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Branch selector (hidden for single-branch pharmacies) ────── */}
      <View style={{ paddingHorizontal: 20 }}>
        <BranchSelector
          selectedBranchId={selectedBranch}
          onSelectBranch={setSelectedBranch}
          hideIfSingle
          accent={C.primary}
          accentMuted={C.primaryMuted}
        />
      </View>

      {/* ── Loading skeleton ───────────────────────────────────────────── */}
      {loading && !refreshing ? (
        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 4 }}>
          <Skeleton height={230} radius={Radius.sm} />
          <Skeleton height={200} radius={Radius.sm} />
        </View>
      ) : (
        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 4 }}>
          {/* ── Financial summary card ───────────────────────────────── */}
          <View style={{ ...card(C.primary), padding: 18, gap: 16 }}>
            {/* Header: title + profit-margin badge */}
            <View
              style={{
                flexDirection: "row-reverse",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: C.foreground, fontSize: 13, fontWeight: "800" }}
              >
                التحليل المالي — {periodLabel}
              </Text>
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: profitBg,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: Radius.xs,
                }}
              >
                <Ionicons
                  name={profitPositive ? "trending-up" : "trending-down"}
                  size={14}
                  color={profitColor}
                />
                <Text
                  style={{ color: profitColor, fontSize: 11, fontWeight: "800" }}
                >
                  {profitMargin.toFixed(1)}% هامش
                </Text>
              </View>
            </View>

            {/* Net profit – large number */}
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: C.mutedForeground,
                  fontSize: 12,
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                صافي الربح
              </Text>
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <Text
                  style={{ color: profitColor, fontSize: 32, fontWeight: "900" }}
                >
                  {Math.abs(profit).toLocaleString("en-US")}
                </Text>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  د.ع
                </Text>
              </View>
            </View>

            {/* Revenue / Expenses split bar */}
            <View style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{ color: C.success, fontSize: 13, fontWeight: "800" }}
                >
                  {(report?.revenue ?? 0).toLocaleString("en-US")}
                </Text>
                <Text
                  style={{ color: C.danger, fontSize: 13, fontWeight: "800" }}
                >
                  {(report?.expenses ?? 0).toLocaleString("en-US")}
                </Text>
              </View>
              {/* Visual bar */}
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: C.dangerBg,
                  overflow: "hidden",
                  flexDirection: "row-reverse",
                }}
              >
                <View
                  style={{
                    width: `${profitBarPct * 100}%`,
                    backgroundColor: C.success,
                    borderRadius: 4,
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: C.mutedForeground, fontSize: 10 }}>
                  الإيرادات
                </Text>
                <Text style={{ color: C.mutedForeground, fontSize: 10 }}>
                  المصروفات
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: C.border }} />

            {/* Transaction stats */}
            <View style={{ flexDirection: "row-reverse", gap: 12 }}>
              <KpiChip
                icon="receipt"
                label="عدد العمليات"
                value={report?.transactions ?? 0}
                color={C.primary}
                bg={C.primaryMuted}
              />
              <KpiChip
                icon="calculator"
                label="متوسط الفاتورة"
                value={avgSale}
                color={C.primarySoft}
                bg={C.primaryMuted}
              />
            </View>
          </View>

          {/* ── Line chart card ───────────────────────────────────────── */}
          {chartData.length >= 2 && (
            <View style={{ ...card(C.primary), paddingVertical: 18 }}>
              {/* Chart header */}
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 18,
                  marginBottom: 16,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: C.foreground,
                      fontWeight: "800",
                      fontSize: 15,
                      textAlign: "right",
                    }}
                  >
                    المبيعات خلال الفترة
                  </Text>
                  {bestDay && (
                    <Text
                      style={{
                        color: C.mutedForeground,
                        fontSize: 11,
                        textAlign: "right",
                        marginTop: 2,
                      }}
                    >
                      أعلى: {bestDay.label} (
                      {bestDay.value.toLocaleString("en-US")} د.ع)
                    </Text>
                  )}
                </View>
                <View
                  style={{
                    backgroundColor: C.primaryMuted,
                    borderRadius: Radius.xs,
                    padding: 8,
                  }}
                >
                  <Ionicons name="trending-up" size={18} color={C.primary} />
                </View>
              </View>

              <SmoothLineChart
                data={chartData}
                color={C.primary}
                isDark={isDarkMode}
                period={period}
              />
            </View>
          )}

          {/* ── Best-day card ─────────────────────────────────────────── */}
          {bestDay && bestDay.value > 0 && (
            <View
              style={{
                ...card(C.primary),
                flexDirection: "row-reverse",
                alignItems: "center",
                padding: 14,
                gap: 12,
              }}
            >
              <View
                style={{
                  backgroundColor: C.primaryMuted,
                  borderRadius: Radius.xs,
                  padding: 10,
                }}
              >
                <Ionicons name="trophy" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: C.foreground,
                    fontWeight: "700",
                    textAlign: "right",
                    fontSize: 13,
                  }}
                >
                  أفضل أداء في الفترة
                </Text>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 12,
                    textAlign: "right",
                    marginTop: 2,
                  }}
                >
                  {bestDay.label} — {bestDay.value.toLocaleString("en-US")} د.ع
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
