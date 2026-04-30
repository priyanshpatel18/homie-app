import { useState, useRef, useEffect } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Animated, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Dimensions, Pressable,
} from "react-native";
import { ChevronLeft, Mail, Twitter } from "lucide-react-native";
import { useLoginWithOAuth, useLoginWithEmail } from "@privy-io/expo";
import GradientButton from "./GradientButton";

const GLASS    = "rgba(255,255,255,0.06)";
const BORDER   = "rgba(255,255,255,0.10)";
const BORDER_LT = "rgba(255,255,255,0.16)";
const TEXT_PRI  = "#FFFFFF";
const TEXT_SEC  = "rgba(255,255,255,0.58)";
const TEXT_MUTED = "rgba(255,255,255,0.28)";
const DANGER    = "rgba(248,113,113,0.85)";
const SHEET_BG  = "rgba(7,9,8,0.97)";
const GREEN     = "#4ADE80";
const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_H = Math.min(SCREEN_H * 0.62, 500);

export default function SocialOtherSheet({ visible, onClose }) {
  const [view, setView]         = useState("main"); // main | email | otp
  const [email, setEmail]       = useState("");
  const [code, setCode]         = useState("");
  const [emailError, setEmailError] = useState("");
  const [codeError, setCodeError]   = useState("");

  const slideY   = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setView("main"); setEmail(""); setCode("");
      setEmailError(""); setCodeError("");
      Animated.parallel([
        Animated.spring(slideY,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(backdrop, { toValue: 1, useNativeDriver: true, duration: 250 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,   { toValue: SHEET_H, useNativeDriver: true, duration: 220 }),
        Animated.timing(backdrop, { toValue: 0,        useNativeDriver: true, duration: 200 }),
      ]).start();
    }
  }, [visible]);

  const { login: oauthLogin, state: oauthState } = useLoginWithOAuth({
    onSuccess: () => onClose(),
    onError: (err) => console.error("[OAuth]", err?.message),
  });

  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onComplete: () => onClose(),
  });

  const oauthLoading = oauthState?.status === "loading";

  async function handleTwitter() {
    try { await oauthLogin({ provider: "twitter" }); } catch {}
  }

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address."); return;
    }
    setEmailError("");
    try { await sendCode({ email: trimmed }); setView("otp"); }
    catch (e) { setEmailError(e?.message || "Failed to send code. Try again."); }
  }

  async function handleVerifyCode() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) { setCodeError("Enter the 6-digit code from your email."); return; }
    setCodeError("");
    try { await loginWithCode({ code: trimmed, email: email.trim().toLowerCase() }); }
    catch (e) { setCodeError(e?.message || "Invalid code. Try again."); }
  }

  function renderHeader(title, onBack) {
    return (
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={onBack} activeOpacity={0.7}>
          <ChevronLeft size={20} color={TEXT_SEC} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{title}</Text>
        <TouchableOpacity style={s.headerBtn} onPress={onClose}>
          <Text style={s.closeX}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderMain() {
    return (
      <View style={s.body}>
        {renderHeader("Other Login Options", onClose)}
        <Text style={s.sub}>Sign in with X or your email address</Text>

        <View style={s.group}>
          <TouchableOpacity style={s.row} onPress={handleTwitter} disabled={oauthLoading} activeOpacity={0.75}>
            <View style={s.rowIcon}><Text style={s.xText}>𝕏</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Continue with X</Text>
            </View>
            {oauthLoading && <ActivityIndicator size={16} color={TEXT_SEC} />}
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => setView("email")} activeOpacity={0.75}>
            <View style={s.rowIcon}><Mail size={17} color={TEXT_SEC} /></View>
            <Text style={s.rowLabel}>Continue with Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderEmail() {
    const sending = emailState?.status === "sending-code";
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.body}>
          {renderHeader("Enter Email", () => setView("main"))}
          <Text style={s.fieldLabel}>Email address</Text>
          <View style={[s.inputBox, emailError && s.inputBoxError]}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={t => { setEmail(t); setEmailError(""); }}
              placeholder="you@example.com"
              placeholderTextColor={TEXT_MUTED}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
          </View>
          {emailError ? <Text style={s.error}>{emailError}</Text> : null}
          <GradientButton onPress={handleSendCode} disabled={sending} style={s.cta} paddingVertical={16}>
            {sending
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.ctaText}>Send Code</Text>}
          </GradientButton>
        </View>
      </KeyboardAvoidingView>
    );
  }

  function renderOtp() {
    const verifying = emailState?.status === "submitting-code";
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.body}>
          {renderHeader("Enter Code", () => setView("email"))}
          <Text style={s.fieldLabel}>6-digit verification code</Text>
          <Text style={s.fieldHint}>Sent to {email}</Text>
          <View style={[s.inputBox, s.inputBoxCode, codeError && s.inputBoxError]}>
            <TextInput
              style={[s.input, s.codeInput]}
              value={code}
              onChangeText={t => { setCode(t.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
              placeholder="000000"
              placeholderTextColor={TEXT_MUTED}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
          </View>
          {codeError ? <Text style={s.error}>{codeError}</Text> : null}
          <GradientButton onPress={handleVerifyCode} disabled={verifying} style={s.cta} paddingVertical={16}>
            {verifying
              ? <ActivityIndicator size={18} color="#000" />
              : <Text style={s.ctaText}>Verify & Sign In</Text>}
          </GradientButton>
          <TouchableOpacity style={s.resendBtn} onPress={() => setView("email")}>
            <Text style={s.resendText}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={s.handle} />
        {view === "main"  && renderMain()}
        {view === "email" && renderEmail()}
        {view === "otp"   && renderOtp()}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "flex-end" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: SHEET_H, backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER_LT,
    overflow: "hidden",
  },
  handle: {
    width: 40, height: 4, backgroundColor: BORDER_LT, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 28 },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: 14,
  },
  headerBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
  },
  headerTitle: { color: TEXT_PRI, fontSize: 16, fontWeight: "700", letterSpacing: 0.1 },
  closeX: { color: TEXT_SEC, fontSize: 14, fontWeight: "600" },
  sub: { color: TEXT_MUTED, fontSize: 13, textAlign: "center", marginBottom: 20 },

  group: {
    backgroundColor: GLASS, borderRadius: 18,
    borderWidth: 1, borderColor: BORDER, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 15, gap: 14,
  },
  rowIcon: {
    width: 36, height: 36, backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 11, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  xText: { color: TEXT_PRI, fontSize: 16, fontWeight: "700" },
  rowLabel: { color: TEXT_PRI, fontSize: 15, fontWeight: "600" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: 66 },

  fieldLabel: { color: TEXT_SEC, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, marginTop: 4, marginBottom: 8 },
  fieldHint: { color: TEXT_MUTED, fontSize: 12, marginBottom: 10, marginTop: -4 },
  inputBox: {
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, marginBottom: 8,
  },
  inputBoxCode: { alignItems: "center" },
  inputBoxError: { borderColor: "rgba(248,113,113,0.45)" },
  input: { color: TEXT_PRI, fontSize: 15, paddingVertical: 14 },
  codeInput: { fontSize: 28, fontWeight: "700", letterSpacing: 10, textAlign: "center" },
  error: { color: DANGER, fontSize: 12, marginBottom: 10 },
  cta: { marginTop: 8, marginBottom: 12 },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },
  resendBtn: { alignItems: "center", paddingVertical: 6 },
  resendText: { color: GREEN, fontSize: 14, fontWeight: "600" },
});
