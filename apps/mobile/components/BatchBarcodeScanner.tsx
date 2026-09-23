import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { AppButton, StateBlock, usePalette } from "./ui/Kit";
import { Radius } from "../constants/colors";

/** Embedded in the batch picker: unmounted before a network lookup starts. */
export function BatchBarcodeScanner({
  onRead,
  onClose,
}: {
  onRead: (barcode: string) => void;
  onClose: () => void;
}) {
  const C = usePalette();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [torch, setTorch] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const consumed = useRef(false);
  useEffect(() => {
    consumed.current = false;
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") void refreshPermission().catch(() => {});
    });
    return () => { consumed.current = true; subscription.remove(); };
  }, [refreshPermission]);
  const askPermission = async () => {
    setRequesting(true);
    setError("");
    try {
      if (permission?.canAskAgain) await requestPermission();
      else await Linking.openSettings();
    } catch {
      setError("تعذر فتح الكاميرا. يمكنك البحث بالاسم أو كتابة الباركود.");
    } finally {
      setRequesting(false);
    }
  };
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <Text
        style={{
          color: C.foreground,
          fontSize: 18,
          fontWeight: "700",
          textAlign: "right",
        }}
      >
        مسح باركود الدواء
      </Text>
      <Text style={{ color: C.mutedForeground, textAlign: "right" }}>
        وجّه الكاميرا إلى الباركود. بعد قراءته اختر الدفعة حسب رقمها وصلاحيتها.
      </Text>
      {!permission ? (
        <StateBlock loading title="جاري التحقق من إذن الكاميرا…" />
      ) : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <StateBlock
            icon="camera-outline"
            title="السماح باستخدام الكاميرا"
            message="تُقرأ الشفرة على الهاتف دون التقاط صورة أو رفعها."
          />
          <AppButton
            label={
              permission.canAskAgain ? "السماح بالكاميرا" : "فتح إعدادات الجهاز"
            }
            loading={requesting}
            onPress={askPermission}
          />
        </View>
      ) : !error && active ? (
        <View
          style={{
            flex: 1,
            minHeight: 220,
            overflow: "hidden",
            borderRadius: Radius.control,
            backgroundColor: "#000",
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13",
                "ean8",
                "upc_a",
                "upc_e",
                "code128",
                "code39",
                "itf14",
                "datamatrix",
                "qr",
              ],
            }}
            onMountError={() =>
              setError(
                "تعذر تشغيل الكاميرا. أغلق الماسح وأعد المحاولة، أو استخدم البحث اليدوي.",
              )
            }
            onBarcodeScanned={({ data }) => {
              const barcode = data.trim();
              if (consumed.current || !barcode || !active) return;
              consumed.current = true;
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
              onRead(barcode);
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: "10%",
              right: "10%",
              top: "35%",
              height: 110,
              borderWidth: 2,
              borderColor: "#fff",
              borderRadius: Radius.control,
            }}
          />
        </View>
      ) : null}
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: C.danger, textAlign: "right" }}
        >
          {error}
        </Text>
      )}
      {permission?.granted && !error && (
        <AppButton
          compact
          label={torch ? "إطفاء الإضاءة" : "تشغيل الإضاءة"}
          variant="outline"
          onPress={() => setTorch((v) => !v)}
        />
      )}
      <AppButton label="العودة إلى البحث" variant="outline" onPress={onClose} />
    </View>
  );
}
