import { routePermission } from "../utils/route-access";
import { View, Text, TouchableOpacity } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { I18nManager } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { dbService } from "../services/db";
import { syncService } from "../services/sync";
import { notificationsService } from "../services/notifications";

import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SyncProvider, useSyncStatus } from "../context/SyncContext";
import { CheckoutProvider } from "../context/CheckoutContext";
import { Colors } from "../constants/colors";
import ThemedAlertHost from "../components/ThemedAlert";

// T049 — RTL-correct animation: slide from left for forward navigation in Arabic
const SLIDE_ANIMATION = I18nManager.isRTL
  ? "slide_from_left"
  : "slide_from_right";

function RootStack() {
  const { isDarkMode } = useTheme();
  const { can, isLoading, user } = useAuth();
  const required = routePermission(usePathname());
  const C = Colors(isDarkMode);
  const { setSyncing, markSynced } = useSyncStatus();

  useEffect(() => {
    // Wire SyncContext callbacks into syncService so the header dot updates
    syncService.setCallbacks({
      onStart: (key) => setSyncing(key, true),
      onDone: (key) => markSynced(key),
      onStop: (key) => setSyncing(key, false),
    });

    // Init local DB
    dbService.init();

    // Register Expo push token with the backend (non-blocking)
    notificationsService.registerPushToken();
    // Respect per-category notification preferences for in-app delivery
    notificationsService.installPreferenceFilter();

    // T051 — Deep linking: notification tap → navigate to relevant screen
    // Uses the guarded notificationsService wrapper (no-op in Expo Go) instead of
    // importing expo-notifications directly, which would trigger the SDK 53 side-effect crash.
    const unsubNotif =
      notificationsService.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as Record<
            string,
            unknown
          >;
          const type = data?.type as string | undefined;

          if (typeof data?.orderId === "string") {
            router.push({
              pathname: "/warehouse-orders" as any,
              params: { orderId: data.orderId },
            });
            return;
          }
          switch (type) {
            case "LOW_STOCK":
            case "EXPIRY":
              router.push("/(tabs)/inventory" as any);
              break;
            case "NEW_PURCHASE": {
              const purchaseId = data?.purchaseId as string | undefined;
              if (purchaseId) router.push(`/purchases/${purchaseId}` as any);
              else router.push("/(tabs)/purchases" as any);
              break;
            }
            default:
              router.push("/(tabs)/alerts" as any);
          }
        },
      );

    return () => {
      unsubNotif.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isLoading || !user) return;
    // AuthProvider has finished validating and renewing the startup session.
    return NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) void syncService.syncData();
    });
  }, [isLoading, user?.id, user?.branchId]);

  const denied = !isLoading && user && required && !can(required);
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      {/* Every screen draws its own header (components/ui/ScreenHeader). */}
      <Stack
        screenOptions={{
          animation: SLIDE_ANIMATION,
          headerShown: false,
          contentStyle: { backgroundColor: C.background },
        }}
      >
        <Stack.Screen name="login" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
      {denied && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            justifyContent: "center",
            padding: 24,
            backgroundColor: C.background,
          }}
        >
          <Text style={{ textAlign: "center", color: C.foreground }}>
            ليس لديك صلاحية لفتح هذه الصفحة.
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(tabs)" as any)}>
            <Text
              style={{ textAlign: "center", color: C.primary, padding: 20 }}
            >
              العودة للرئيسية
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <CheckoutProvider>
            <RootStack />
          </CheckoutProvider>
          {/* Branded replacement for native Alert.alert across the whole app */}
          <ThemedAlertHost />
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
