import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { managerPalette } from "../../constants/colors";

const PHONE = "+9647857581997";
const WHATSAPP_URL = `https://wa.me/9647857581997`;
const CALL_URL = `tel:${PHONE}`;

export default function SupportScreen() {
  const { isDarkMode } = useTheme();
  const C = managerPalette(isDarkMode);

  const channels = [
    {
      label: "اتصل بنا",
      subtitle: PHONE,
      icon: "call" as const,
      iconBg: C.primaryMuted,
      iconColor: C.primary,
      bg: C.primary,
      textColor: "#fff",
      onPress: () => Linking.openURL(CALL_URL),
    },
    {
      label: "واتساب",
      subtitle: "راسلنا مباشرة",
      icon: "logo-whatsapp" as const,
      iconBg: "#E7F9EE",
      iconColor: "#25D366",
      bg: "#25D366",
      textColor: "#fff",
      onPress: () => Linking.openURL(WHATSAPP_URL),
    },
  ];

  const faqs = [
    {
      q: "كيف أضيف منتجاً جديداً؟",
      a: 'من صفحة المخزون اضغط على زر "+" في أعلى الصفحة.',
    },
    {
      q: "كيف أسجل بيعاً؟",
      a: 'من الصفحة الرئيسية اضغط على "نقطة البيع" واختر المنتجات.',
    },
    {
      q: "كيف أطلب من المورد؟",
      a: "من صفحة الطلبات الذكية أو إنشاء طلب شراء يدوي.",
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 5,
          padding: 20,
          alignItems: "center",
          borderWidth: 1.5,
          borderColor: `${C.primary}33`,
          marginBottom: 20,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 5,
            backgroundColor: C.primaryMuted,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="headset" size={32} color={C.primary} />
        </View>
        <Text
          style={{
            color: C.foreground,
            fontSize: 18,
            fontWeight: "900",
            marginBottom: 6,
          }}
        >
          هل تحتاج مساعدة؟
        </Text>
        <Text
          style={{
            color: C.mutedForeground,
            fontSize: 13,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          فريق الدعم متاح لمساعدتك خلال أوقات العمل
        </Text>

        {/* Hours badge */}
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 5,
            backgroundColor: C.successBg,
            borderRadius: 5,
            paddingHorizontal: 12,
            paddingVertical: 5,
            marginTop: 12,
          }}
        >
          <Ionicons name="time-outline" size={13} color={C.success} />
          <Text style={{ color: C.success, fontSize: 12, fontWeight: "700" }}>
            ٩ ص — ٦ م · السبت إلى الخميس
          </Text>
        </View>
      </View>

      {/* Contact channels */}
      <Text
        style={{
          color: C.mutedForeground,
          fontSize: 11,
          fontWeight: "700",
          textAlign: "right",
          marginBottom: 10,
          paddingHorizontal: 4,
          letterSpacing: 0.5,
        }}
      >
        وسائل التواصل
      </Text>

      <View style={{ gap: 10, marginBottom: 24 }}>
        {channels.map((ch) => (
          <TouchableOpacity
            key={ch.label}
            onPress={ch.onPress}
            activeOpacity={0.85}
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 12,
              backgroundColor: C.card,
              borderRadius: 5,
              borderWidth: 1.5,
              borderColor: `${C.primary}33`,
              paddingVertical: 14,
              paddingHorizontal: 14,
              elevation: 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 4,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 5,
                backgroundColor: ch.iconBg,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <Ionicons name={ch.icon} size={21} color={ch.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: C.foreground,
                  fontSize: 15,
                  fontWeight: "700",
                  textAlign: "right",
                }}
              >
                {ch.label}
              </Text>
              <Text
                style={{
                  color: C.mutedForeground,
                  fontSize: 12,
                  textAlign: "right",
                  marginTop: 2,
                }}
              >
                {ch.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={C.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      {/* FAQ */}
      <Text
        style={{
          color: C.mutedForeground,
          fontSize: 11,
          fontWeight: "700",
          textAlign: "right",
          marginBottom: 10,
          paddingHorizontal: 4,
          letterSpacing: 0.5,
        }}
      >
        أسئلة شائعة
      </Text>

      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: `${C.primary}33`,
          overflow: "hidden",
        }}
      >
        {faqs.map((faq, i) => (
          <View key={i}>
            <View style={{ padding: 14 }}>
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    backgroundColor: C.primaryMuted,
                    borderRadius: 5,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      color: C.primary,
                      fontSize: 10,
                      fontWeight: "800",
                    }}
                  >
                    س
                  </Text>
                </View>
                <Text
                  style={{
                    color: C.foreground,
                    fontSize: 14,
                    fontWeight: "700",
                    textAlign: "right",
                    flex: 1,
                  }}
                >
                  {faq.q}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    backgroundColor: C.successBg,
                    borderRadius: 5,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      color: C.success,
                      fontSize: 10,
                      fontWeight: "800",
                    }}
                  >
                    ج
                  </Text>
                </View>
                <Text
                  style={{
                    color: C.mutedForeground,
                    fontSize: 13,
                    textAlign: "right",
                    flex: 1,
                    lineHeight: 19,
                  }}
                >
                  {faq.a}
                </Text>
              </View>
            </View>
            {i < faqs.length - 1 && (
              <View style={{ height: 1, backgroundColor: C.border }} />
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
