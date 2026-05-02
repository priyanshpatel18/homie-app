/**
 * VoiceInputBubble — Minimal, premium voice input overlay
 *
 * Zero GPU / Skia dependency. Pure Reanimated + RN views.
 * Lightweight concentric ring pulse + clean typography.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, Alert,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence, withSpring, withDelay,
  cancelAnimation, Easing as RE, interpolate,
} from "react-native-reanimated";
import { X, ArrowUp, Mic, MicOff } from "lucide-react-native";
import { F } from "../theme/fonts";
import { lockSuppression } from "../state/lockSuppression";

const { width: SW } = Dimensions.get("window");
const GREEN = "#4ADE80";

// ─── Safe speech module import ────────────────────────────────────────────────
let SpeechModule   = null;
let useSpeechEvent = null;
let speechAvailable = false;
try {
  const mod = require("expo-speech-recognition");
  SpeechModule   = mod.ExpoSpeechRecognitionModule;
  useSpeechEvent = mod.useSpeechRecognitionEvent;
  speechAvailable = true;
} catch { /* not linked — graceful degrade */ }
function useNoopEvent() {}

// ─── Pulse Ring — lightweight animated circle ─────────────────────────────────
function PulseRing({ delay = 0, size, listening }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (listening) {
      pulse.value = withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: 2000, easing: RE.out(RE.ease) }),
          -1, false,
        ),
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 400 });
    }
  }, [listening]);

  const ringStyle = useAnimatedStyle(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    position: "absolute",
    borderWidth: 1.5,
    borderColor: GREEN,
    opacity: interpolate(pulse.value, [0, 0.4, 1], [0.35, 0.20, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.8]) }],
  }));

  return <Animated.View style={ringStyle} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VoiceInputBubble({ visible, onClose, onSubmit }) {

  const [voiceState, setVoiceState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError]           = useState(null);

  // Simple animations
  const bgOpacity   = useSharedValue(0);
  const contentY    = useSharedValue(40);
  const orbScale    = useSharedValue(0.6);
  const orbGlow     = useSharedValue(0);
  const breathe     = useSharedValue(0);

  // ── Modal enter / exit ──
  useEffect(() => {
    if (visible) {
      bgOpacity.value = withTiming(1, { duration: 300 });
      contentY.value  = withSpring(0, { damping: 18, stiffness: 100 });
      orbScale.value  = withSpring(1, { damping: 14, stiffness: 90 });
      // Subtle idle breathe
      breathe.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: RE.inOut(RE.ease) }),
          withTiming(0, { duration: 2200, easing: RE.inOut(RE.ease) }),
        ), -1, false,
      );
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
      contentY.value  = withTiming(40, { duration: 200 });
    }
  }, [visible]);

  // ── State transitions ──
  useEffect(() => {
    if (voiceState === "listening") {
      orbGlow.value = withTiming(1, { duration: 400 });
      orbScale.value = withSpring(1.05, { damping: 12, stiffness: 95 });
    } else if (voiceState === "thinking") {
      orbGlow.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ), -1, false,
      );
      orbScale.value = withRepeat(
        withSequence(
          withTiming(0.92, { duration: 700, easing: RE.inOut(RE.ease) }),
          withTiming(1.0, { duration: 700, easing: RE.inOut(RE.ease) }),
        ), -1, false,
      );
    } else {
      orbGlow.value = withTiming(0, { duration: 400 });
      orbScale.value = withSpring(1, { damping: 14, stiffness: 90 });
    }
  }, [voiceState]);

  // ── Speech events ──
  const useEv = speechAvailable ? useSpeechEvent : useNoopEvent;
  useEv("start",  ()  => { setVoiceState("listening"); setError(null); });
  useEv("end",    ()  => { setVoiceState(p => p === "listening" ? "idle" : p); });
  useEv("result", (e) => { setTranscript(e.results[0]?.transcript || ""); });
  useEv("error",  (e) => {
    if (e.error !== "aborted") setError(e.error === "no-speech" ? "No speech detected." : "Try again.");
    setVoiceState("idle");
  });

  // ── Reset on hide ──
  useEffect(() => {
    if (!visible) {
      if (SpeechModule) try { SpeechModule.abort(); } catch {}
      setTranscript(""); setError(null); setVoiceState("idle");
    }
  }, [visible]);

  // ── Auto-start ──
  useEffect(() => {
    if (visible && speechAvailable) {
      const t = setTimeout(startListening, 400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // ── Actions ──
  const startListening = useCallback(async () => {
    if (!speechAvailable || !SpeechModule) {
      Alert.alert("Voice unavailable", "Requires a dev build — run `npx expo prebuild`.");
      return;
    }
    setTranscript(""); setError(null);
    // Suppress app-lock — speech recognition briefly backgrounds the app on Android
    lockSuppression.active = true;
    try {
      const { granted } = await SpeechModule.requestPermissionsAsync();
      if (!granted) { lockSuppression.active = false; setError("Microphone permission required."); return; }
      SpeechModule.start({
        lang: "en-US", interimResults: true, continuous: true, addsPunctuation: true,
      });
    } catch { lockSuppression.active = false; setError("Could not start voice input."); }
  }, []);

  const stopListening = useCallback(() => {
    if (SpeechModule) SpeechModule.stop();
  }, []);

  const handleSend = useCallback(() => {
    if (!transcript.trim()) return;
    if (SpeechModule) try { SpeechModule.abort(); } catch {}
    setVoiceState("thinking");
    setTimeout(() => { onSubmit(transcript.trim()); onClose(); }, 600);
  }, [transcript, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    lockSuppression.active = true; // suppress re-lock from abort backgrounding
    if (SpeechModule) try { SpeechModule.abort(); } catch {}
    onClose();
  }, [onClose]);

  // ── Animated styles ──
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentY.value }],
    opacity: interpolate(contentY.value, [40, 0], [0, 1]),
  }));

  const orbContainerStyle = useAnimatedStyle(() => {
    const b = breathe.value;
    const baseScale = orbScale.value;
    const breatheScale = interpolate(b, [0, 1], [1, 1.03]);
    return {
      transform: [{ scale: baseScale * breatheScale }],
    };
  });

  const orbInnerStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(orbGlow.value, [0, 1], [0.15, 0.6]),
    shadowRadius: interpolate(orbGlow.value, [0, 1], [12, 32]),
  }));

  if (!visible) return null;

  const isListening   = voiceState === "listening";
  const isThinking    = voiceState === "thinking";
  const hasTranscript = transcript.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>

      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />

      {/* Content */}
      <Animated.View style={[s.content, contentStyle]}>

        {/* Close */}
        <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.7}>
          <X size={18} color="rgba(255,255,255,0.5)" strokeWidth={2} />
        </TouchableOpacity>

        {/* Status label */}
        <Text style={s.statusLabel}>
          {isThinking ? "Processing..." : isListening ? "Listening" : "Tap to speak"}
        </Text>

        {/* Orb area */}
        <View style={s.orbArea}>
          <Animated.View style={[s.orbContainer, orbContainerStyle]}>

            {/* Pulse rings — only when listening */}
            <PulseRing delay={0}   size={120} listening={isListening} />
            <PulseRing delay={600} size={120} listening={isListening} />
            <PulseRing delay={1200} size={120} listening={isListening} />

            {/* Core orb */}
            <TouchableOpacity
              onPress={isListening ? stopListening : isThinking ? undefined : startListening}
              activeOpacity={0.85}
              disabled={isThinking}
              style={s.orbTouchable}
            >
              <Animated.View style={[s.orbCore, isListening && s.orbCoreActive, orbInnerStyle]}>
                {isListening
                  ? <MicOff size={28} color="#000" strokeWidth={2} />
                  : <Mic    size={28} color={isThinking ? "rgba(255,255,255,0.3)" : GREEN} strokeWidth={2} />
                }
              </Animated.View>
            </TouchableOpacity>

          </Animated.View>
        </View>

        {/* Transcript / hint area */}
        <View style={s.textArea}>
          {transcript ? (
            <Text style={s.transcriptText} numberOfLines={5}>{transcript}</Text>
          ) : error ? (
            <Text style={s.errorText}>{error}</Text>
          ) : (
            <Text style={s.hintText}>
              {isListening ? "speak freely..." : isThinking ? "" : "tap the mic to begin"}
            </Text>
          )}
        </View>

        {/* Send button */}
        {hasTranscript && !isThinking && (
          <TouchableOpacity style={s.sendBtn} onPress={handleSend} activeOpacity={0.85}>
            <Text style={s.sendText}>Send</Text>
            <ArrowUp size={16} color="#000" strokeWidth={2.5} />
          </TouchableOpacity>
        )}

        {/* Thinking indicator */}
        {isThinking && (
          <View style={s.thinkingRow}>
            <View style={[s.thinkDot, { opacity: 0.3 }]} />
            <View style={[s.thinkDot, { opacity: 0.6 }]} />
            <View style={[s.thinkDot, { opacity: 1 }]} />
          </View>
        )}

      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.92)",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  closeBtn: {
    position: "absolute",
    top: 56,
    right: 22,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },

  statusLabel: {
    position: "absolute",
    top: "28%",
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontFamily: F.medium,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  // ── Orb ──
  orbArea: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },

  orbContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },

  orbTouchable: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  orbCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(74,222,128,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(74,222,128,0.25)",
    alignItems: "center",
    justifyContent: "center",
    // Shadow for glow effect
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  orbCoreActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
    shadowOpacity: 0.5,
    shadowRadius: 28,
  },

  // ── Text area ──
  textArea: {
    minHeight: 80,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 16,
    maxWidth: SW * 0.85,
  },
  transcriptText: {
    color: "#fff",
    fontSize: 22,
    fontFamily: F.headSemi,
    textAlign: "center",
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  hintText: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 15,
    fontFamily: F.regular,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    fontFamily: F.regular,
    textAlign: "center",
  },

  // ── Send button ──
  sendBtn: {
    position: "absolute",
    bottom: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
  },
  sendText: {
    color: "#000",
    fontSize: 15,
    fontFamily: F.headSemi,
    letterSpacing: -0.2,
  },

  // ── Thinking dots ──
  thinkingRow: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    gap: 6,
  },
  thinkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
});
