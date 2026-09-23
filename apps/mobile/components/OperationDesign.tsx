import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Surface,
  IconTile,
  NavigationArrow,
  StatusBadge,
  usePalette,
  Tone,
} from "./ui/Kit";
import { Radius } from "../constants/colors";
type Icon = React.ComponentProps<typeof Ionicons>["name"];
export const operationTone = (status: string): Tone =>
  ["COMPLETED", "DELIVERED", "ACCEPTED"].includes(status)
    ? "success"
    : ["CANCELLED", "REJECTED"].includes(status)
      ? "danger"
      : ["PENDING", "SENT", "REVIEWING", "IN_TRANSIT", "SHIPPED"].includes(
            status,
          )
        ? "warning"
        : "primary";
export function OperationHeading({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: Icon;
  children?: React.ReactNode;
}) {
  const C = usePalette();
  return (
    <Surface style={{ gap: 14 }}>
      <View
        style={{ flexDirection: "row-reverse", gap: 12, alignItems: "center" }}
      >
        <IconTile icon={icon} size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: C.foreground,
              textAlign: "right",
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 19,
              color: C.mutedForeground,
              textAlign: "right",
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      {children && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: C.border,
            paddingTop: 12,
            gap: 10,
          }}
        >
          {children}
        </View>
      )}
    </Surface>
  );
}
export function OperationFilters({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const C = usePalette();
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          disabled={disabled}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value, disabled }}
          style={{
            flexGrow: 1,
            flexBasis: "28%",
            minHeight: 44,
            borderRadius: Radius.control,
            borderWidth: 1,
            borderColor: value === o.value ? C.primary : C.border,
            backgroundColor: value === o.value ? C.primaryMuted : C.card,
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            gap: 4,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: value === o.value ? "800" : "600",
              color: value === o.value ? C.primary : C.mutedForeground,
              textAlign: "center",
            }}
          >
            {o.label}
          </Text>
          {o.count !== undefined && (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: value === o.value ? C.primary : C.foreground,
              }}
            >
              {o.count.toLocaleString("en-US")}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}
export function OperationRecord({
  title,
  subtitle,
  icon,
  status,
  statusLabel,
  date,
  meta,
  onPress,
  disabled,
}: {
  title: string;
  subtitle: string;
  icon: Icon;
  status: string;
  statusLabel: string;
  date: string;
  meta?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const C = usePalette();
  return (
    <TouchableOpacity
      disabled={disabled}
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}، ${statusLabel}، عرض التفاصيل`}
    >
      <Surface style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 10,
          }}
        >
          <IconTile icon={icon} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: C.foreground,
                fontSize: 16,
                fontWeight: "800",
                textAlign: "right",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: C.mutedForeground,
                fontSize: 12,
                lineHeight: 18,
                textAlign: "right",
              }}
            >
              {subtitle}
            </Text>
          </View>
          <NavigationArrow size={25} />
        </View>
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            borderTopWidth: 1,
            borderTopColor: C.border,
            paddingTop: 10,
          }}
        >
          <StatusBadge label={statusLabel} tone={operationTone(status)} />
          <Text style={{ fontSize: 11, color: C.mutedForeground }}>{date}</Text>
        </View>
        {meta && (
          <Text
            style={{
              fontSize: 13,
              color: C.primary,
              fontWeight: "700",
              textAlign: "right",
            }}
          >
            {meta}
          </Text>
        )}
      </Surface>
    </TouchableOpacity>
  );
}
export function OperationItem({
  title,
  subtitle,
  icon = "cube-outline",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: Icon;
  children?: React.ReactNode;
}) {
  const C = usePalette();
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}
      >
        <IconTile icon={icon} size={34} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: C.foreground,
              textAlign: "right",
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                color: C.mutedForeground,
                textAlign: "right",
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {children && (
        <View
          style={{
            flexDirection: "row-reverse",
            flexWrap: "wrap",
            gap: 8,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: C.border,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
export function OperationChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const C = usePalette();
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: Radius.control,
        borderWidth: 1,
        borderColor: selected ? C.primary : C.border,
        backgroundColor: selected ? C.primaryMuted : C.card,
      }}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? C.primary : C.mutedForeground}
      />
      <Text
        style={{
          flex: 1,
          textAlign: "right",
          fontSize: 13,
          fontWeight: "700",
          color: selected ? C.primary : C.foreground,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
