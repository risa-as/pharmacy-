import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Dimensions,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../services/auth";
import { biometricService } from "../services/biometric";
import { useAuth } from "../context/AuthContext";

const { width, height } = Dimensions.get("window");

export default function LoginScreen() {
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const supported = await biometricService.checkHardware();
    setIsBiometricSupported(supported);
    if (supported) {
      const creds = await biometricService.getCredentials();
      setHasSavedCredentials(!!creds);
    }
  };

  const handleBiometricLogin = async () => {
    const authenticated = await biometricService.authenticate();
    if (authenticated) {
      setLoading(true);
      try {
        const creds = await biometricService.getCredentials();
        if (creds) {
          await authService.login(creds.email, creds.pass);
          await refreshUser();
          router.replace("/(tabs)");
        } else {
          Alert.alert("خطأ", "لا توجد بيانات محفوظة");
        }
      } catch (error: any) {
        Alert.alert("خطأ", error.message || "فشل تسجيل الدخول بالبصمة");
      } finally {
        setLoading(false);
      }
    }
  };

  const enableBiometricLogin = async () => {
    setShowBiometricPrompt(false);
    try {
      await biometricService.saveCredentials(email, password);
    } catch {
      // Saving failed — proceed anyway; the user can enable it next time.
    }
    router.replace("/(tabs)");
  };

  const skipBiometricLogin = () => {
    setShowBiometricPrompt(false);
    router.replace("/(tabs)");
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("خطأ", "يرجى ملء جميع الحقول");
      return;
    }
    setLoading(true);
    try {
      await authService.login(email, password);
      await refreshUser();
      if (isBiometricSupported) {
        // Show a branded prompt instead of the unstyleable native alert.
        setShowBiometricPrompt(true);
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* ── Decorative circles ── */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />
      <View style={styles.circleMid} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand section ── */}
        <View style={styles.brand}>
          <View style={styles.logoShadow}>
            <View style={styles.logoWrapper}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>
          </View>
          <Text style={styles.appName}>فاراماس</Text>
          <Text style={styles.tagline}>نظام إدارة الصيدليات</Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>
          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderAccent} />
            <View>
              <Text style={styles.cardTitle}>تسجيل الدخول</Text>
              <Text style={styles.cardSubtitle}>أدخل بياناتك للمتابعة</Text>
            </View>
          </View>

          {/* Email field */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
            <View style={[
              styles.inputRow,
              focusedField === "email" && styles.inputRowFocused,
            ]}>
              <TextInput
                style={styles.input}
                placeholder="example@email.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textAlign="right"
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />
              <View style={[
                styles.inputIcon,
                focusedField === "email" && styles.inputIconFocused,
              ]}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={focusedField === "email" ? "#1E6FBF" : "#9ca3af"}
                />
              </View>
            </View>
          </View>

          {/* Password field */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>كلمة المرور</Text>
            <View style={[
              styles.inputRow,
              focusedField === "password" && styles.inputRowFocused,
            ]}>
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#9ca3af"
                />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textAlign="right"
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
              />
              <View style={[
                styles.inputIcon,
                focusedField === "password" && styles.inputIconFocused,
              ]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={focusedField === "password" ? "#1E6FBF" : "#9ca3af"}
                />
              </View>
            </View>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.75 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Biometric */}
          {isBiometricSupported && hasSavedCredentials && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>أو</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={[styles.biometricBtn, loading && { opacity: 0.75 }]}
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Ionicons name="finger-print" size={24} color="#1E6FBF" />
                <Text style={styles.biometricText}>الدخول بالبصمة</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>© 2026 فاراماس · جميع الحقوق محفوظة</Text>
      </ScrollView>

      {/* ── Branded "enable quick login" prompt ── */}
      <Modal
        visible={showBiometricPrompt}
        transparent
        animationType="fade"
        onRequestClose={skipBiometricLogin}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="finger-print" size={36} color={PRIMARY} />
            </View>
            <Text style={styles.modalTitle}>تفعيل الدخول السريع</Text>
            <Text style={styles.modalDesc}>
              فعّل الدخول بالبصمة أو بصمة الوجه لتسجيل الدخول بسرعة وأمان في المرات القادمة.
            </Text>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={enableBiometricLogin}
              activeOpacity={0.85}
            >
              <Ionicons name="finger-print" size={18} color="#fff" />
              <Text style={styles.modalPrimaryText}>نعم، تفعيل</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalGhostBtn}
              onPress={skipBiometricLogin}
              activeOpacity={0.7}
            >
              <Text style={styles.modalGhostText}>لاحقاً</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const PRIMARY   = "#1E6FBF";
const PRIMARY_D = "#17578F";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },

  /* Decorative circles */
  circleTopRight: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: -80,
    right: -80,
  },
  circleBottomLeft: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: 60,
    left: -70,
  },
  circleMid: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.04)",
    top: height * 0.28,
    left: -30,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  /* Brand */
  brand: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 80 : 60,
    paddingBottom: 32,
  },
  logoShadow: {
    borderRadius: 28,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 14,
    backgroundColor: "#fff",
  },
  logoWrapper: {
    width: 110,
    height: 110,
    borderRadius: 28,
    overflow: "hidden",
  },
  logo: {
    width: 110,
    height: 110,
  },
  appName: {
    fontSize: 34,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "500",
    letterSpacing: 0.5,
  },

  /* Card */
  card: {
    backgroundColor: "#fff",
    borderRadius: 5,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  cardHeaderAccent: {
    width: 4,
    height: 22,
    backgroundColor: PRIMARY,
    borderRadius: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "right",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
    textAlign: "right",
  },

  /* Fields */
  fieldWrapper: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textAlign: "right",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 5,
    backgroundColor: "#fafafa",
    paddingHorizontal: 4,
  },
  inputRowFocused: {
    borderColor: PRIMARY,
    backgroundColor: "#fff",
  },
  inputIcon: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
    marginRight: 2,
  },
  inputIconFocused: {
    backgroundColor: "#E6F0FA",
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: "#111827",
    paddingHorizontal: 8,
  },
  eyeBtn: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Login button */
  loginBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 5,
    height: 52,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  /* Divider */
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  dividerText: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
  },

  /* Biometric */
  biometricBtn: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    height: 50,
    borderWidth: 1.5,
    borderColor: "#E6F0FA",
    borderRadius: 5,
    backgroundColor: "#EFF5FC",
  },
  biometricText: {
    color: PRIMARY,
    fontSize: 15,
    fontWeight: "700",
  },

  /* Footer */
  footer: {
    textAlign: "center",
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginTop: 28,
    fontWeight: "500",
  },

  /* Biometric prompt modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 5,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#E6F0FA",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalPrimaryBtn: {
    width: "100%",
    backgroundColor: PRIMARY,
    borderRadius: 5,
    height: 52,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  modalPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  modalGhostBtn: {
    width: "100%",
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  modalGhostText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
  },
});
