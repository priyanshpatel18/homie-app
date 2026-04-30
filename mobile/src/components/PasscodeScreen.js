import { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  Dimensions, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { savePasscode, verifyPasscode } from "../services/passcode";
import GradientButton from "./GradientButton";

const { width: W, height: H } = Dimensions.get("window");
const GREEN    = "#4ADE80";
const CODE_LEN = 6;
const SHEET_BG = "rgba(8,10,9,0.98)";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

// ─── Dot row ──────────────────────────────────────────────────────────────────
function Dots({ value, shake }) {
  return (
    <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]}>
      {Array.from({ length: CODE_LEN }).map((_, i) => (
        <View key={i} style={[s.dot, i < value.length && s.dotFilled]} />
      ))}
    </Animated.View>
  );
}

// ─── Numpad ───────────────────────────────────────────────────────────────────
function Numpad({ onPress }) {
  return (
    <View style={s.pad}>
      {KEYS.map((row, r) => (
        <View key={r} style={s.padRow}>
          {row.map((key, c) => (
            <TouchableOpacity
              key={c}
              style={[s.key, key === "" && s.keyGhost]}
              onPress={() => key !== "" && onPress(key)}
              activeOpacity={key === "" ? 1 : 0.55}
              disabled={key === ""}
            >
              <Text style={[s.keyText, key === "⌫" && s.keyBackspace]}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * mode="setup"  → two-step: enter then confirm. calls onSuccess() when done.
 * mode="verify" → single entry. calls onSuccess() on correct code, shakes on wrong.
 */
export default function PasscodeScreen({ mode = "verify", onSuccess }) {
  const insets = useSafeAreaInsets();
  const [step, setStep]   = useState("enter"); // enter | confirm
  const [value, setValue] = useState("");
  const [firstCode, setFirst] = useState("");
  const [error, setError] = useState("");

  // Sheet slides up from off-screen bottom
  const sheetY  = useRef(new Animated.Value(H)).current;
  const backdropO = useRef(new Animated.Value(0)).current;
  const shake   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropO, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, tension: 68, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  function doShake(cb) {
    Animated.sequence([
      Animated.timing(shake, { toValue:  10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue:   8, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue:  -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue:   0, duration: 55, useNativeDriver: true }),
    ]).start(() => cb?.());
  }

  function handleKey(key) {
    if (key === "⌫") { setValue(v => v.slice(0, -1)); setError(""); return; }
    const next = value + key;
    setValue(next);
    if (next.length < CODE_LEN) return;
    setTimeout(() => process(next), 80);
  }

  async function process(code) {
    if (mode === "setup") {
      if (step === "enter") {
        setFirst(code); setStep("confirm"); setValue(""); setError("");
      } else {
        if (code === firstCode) {
          try {
            await savePasscode(code);
            onSuccess();
          } catch {
            doShake(() => { setValue(""); setError("Failed to save passcode. Try again."); });
          }
        } else {
          doShake(() => { setValue(""); setError("Codes don't match. Try again."); });
        }
      }
    } else {
      try {
        const ok = await verifyPasscode(code);
        if (ok) {
          onSuccess();
        } else {
          doShake(() => { setValue(""); setError("Wrong passcode. Try again."); });
        }
      } catch {
        doShake(() => { setValue(""); setError("Try again."); });
      }
    }
  }

  function goBack() {
    setStep("enter"); setFirst(""); setValue(""); setError("");
  }

  const title = mode === "setup"
    ? (step === "enter" ? "Set App Passcode" : "Confirm Passcode")
    : "Enter Passcode";

  const sub = mode === "setup"
    ? (step === "enter"
        ? "Enter a 6-digit passcode to secure your app"
        : "Re-enter your passcode to confirm")
    : "Enter your passcode to continue";

  const canContinue = value.length === CODE_LEN;

  return (
    <View style={s.root}>
      {/* Semi-transparent backdrop — background remains visible */}
      <Animated.View style={[s.backdrop, { opacity: backdropO }]} />

      {/* Bottom sheet */}
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY: sheetY }] },
        ]}
      >
        {/* Drag handle */}
        <View style={s.handle} />

        {/* Back button — only on confirm step */}
        {mode === "setup" && step === "confirm" && (
          <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
            <ChevronLeft size={20} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        )}

        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>

        <Dots value={value} shake={shake} />

        {error
          ? <Text style={s.error}>{error}</Text>
          : <View style={{ height: 18 }} />}

        <Numpad onPress={handleKey} />

        <GradientButton
          label="Continue"
          onPress={() => canContinue && process(value)}
          disabled={!canContinue}
          style={{ width: "100%", marginTop: 18 }}
          paddingVertical={17}
        />
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const KEY_SIZE = (W - 48 - 20) / 3;

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  // ── Sheet ──
  sheet: {
    width: "100%",
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.10)",
    paddingTop: 12, paddingHorizontal: 24,
    alignItems: "center",
  },

  handle: {
    width: 40, height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2, marginBottom: 24,
  },

  backBtn: {
    alignSelf: "flex-start",
    padding: 6,
    marginBottom: 8,
  },

  title: {
    color: "#fff",
    fontSize: 22, fontWeight: "700",
    letterSpacing: -0.3, marginBottom: 8,
  },
  sub: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 13, textAlign: "center", lineHeight: 18,
    marginBottom: 28,
  },

  // ── Dots ──
  dots: { flexDirection: "row", gap: 14, marginBottom: 4 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: GREEN, borderColor: GREEN },

  error: {
    color: "#FF6B6B", fontSize: 12,
    marginTop: 8, marginBottom: 2, textAlign: "center",
  },

  // ── Numpad ──
  pad: { width: "100%", marginTop: 20, gap: 10 },
  padRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  key: {
    flex: 1, height: KEY_SIZE * 0.70,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  keyGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  keyText: { color: "#fff", fontSize: 22, fontWeight: "500" },
  keyBackspace: { fontSize: 20, color: "rgba(255,255,255,0.50)" },
});
