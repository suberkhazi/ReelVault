import { BlurView } from "expo-blur";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { vaultApi } from "../services/vaultApi";
import { useAppTheme } from "../theme/useAppTheme";

export default function AuthScreen({ onAuthSuccess, showToast }) {
  const { colors, isDark } = useAppTheme();

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const handleAuth = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      showToast("❌ Please enter a username and password.");
      return;
    }

    try {
      if (authMode === "register") {
        showToast("⏳ Creating account...");
        await vaultApi.register(authUsername.trim(), authPassword);
        showToast("✅ Account created! Please log in.");
        setAuthMode("login");
        setAuthPassword("");
      } else {
        showToast("⏳ Logging in...");
        const data = await vaultApi.login(authUsername.trim(), authPassword);
        showToast(`👋 Welcome back, ${data.user.username}!`);
        onAuthSuccess(data.user, data.token);
      }
    } catch (error: any) {
      showToast(`❌ ${error?.message || "Authentication failed"}`);
    }
  };

  const Card = ({ children }) =>
    Platform.OS === "web" ? (
      <View style={s.webGlass}>{children}</View>
    ) : (
      <BlurView
        intensity={35}
        tint={isDark ? "dark" : "light"}
        style={s.nativeGlass}
      >
        {children}
      </BlurView>
    );

  return (
    <ScrollView
      contentContainerStyle={s.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.brandWrap}>
        <Text style={s.brand}>ReelVault</Text>
        <Text style={s.subtitle}>
          {authMode === "login" ? "Welcome back." : "Create your secure vault."}
        </Text>
      </View>

      <Card>
        <View style={s.cardInner}>
          <TextInput
            style={s.input}
            placeholder="Username"
            placeholderTextColor={colors.subtext}
            value={authUsername}
            onChangeText={setAuthUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor={colors.subtext}
            value={authPassword}
            onChangeText={setAuthPassword}
            secureTextEntry
          />

          <TouchableOpacity style={s.primaryBtn} onPress={handleAuth}>
            <Text style={s.primaryBtnText}>
              {authMode === "login" ? "Log In" : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setAuthMode(authMode === "login" ? "register" : "login")
            }
          >
            <Text style={s.switchText}>
              {authMode === "login"
                ? "Don't have an account? Sign Up"
                : "Already have an account? Log In"}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    </ScrollView>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
      backgroundColor: colors.bg,
    },
    brandWrap: { marginBottom: 24, alignItems: "center" },
    brand: {
      color: colors.text,
      fontSize: 42,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    subtitle: { color: colors.subtext, marginTop: 6, fontSize: 15 },

    nativeGlass: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    webGlass: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? "rgba(44,44,46,0.72)" : "rgba(255,255,255,0.8)",
      backdropFilter: "blur(20px)",
    } as any,

    cardInner: { padding: 18, gap: 12 },

    input: {
      width: "100%",
      backgroundColor: colors.input,
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 16,
    },

    primaryBtn: {
      marginTop: 6,
      backgroundColor: colors.tint,
      height: 50,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },

    switchText: {
      color: colors.tint,
      fontSize: 14,
      textAlign: "center",
      marginTop: 10,
      marginBottom: 4,
    },
  });
