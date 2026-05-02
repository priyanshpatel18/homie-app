import React, { useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Dimensions,
} from "react-native";
import { PawPrint, Wallet, TrendingUp, Zap, MessageCircle } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_W } = Dimensions.get("window");
const ONBOARDED_KEY  = "@homie_onboarded_v1";
const TRADE_MODE_KEY = "@homie_trade_mode";

const TEXT_PRI   = "#FFFFFF";
const TEXT_SEC   = "rgba(255,255,255,0.65)";
const TEXT_MUTED = "rgba(255,255,255,0.35)";
const GREEN      = "#4ADE80";
const GLASS      = "rgba(255,255,255,0.07)";
const GLASS_BDR  = "rgba(255,255,255,0.12)";
const GLASS_MED  = "rgba(255,255,255,0.10)";

const INFO_STEPS = [
  {
    id:      "meet",
    icon:    "paw",
    title:   "Meet Homie",
    body:    "Your DeFi co-pilot on Solana. Ask anything — prices, yields, trade ideas — and I'll give you straight answers, not sales pitches.",
    tryMsg:  "What can you do?",
    tryLabel: "Ask what I can do",
  },
  {
    id:      "wallet",
    icon:    "wallet",
    title:   "Your wallet, read instantly",
    body:    "I can read your SOL balance, token holdings, and open positions in real time. No connecting to a third-party dashboard needed.",
    tryMsg:  "What's in my wallet?",
    tryLabel: "Check my wallet",
  },
  {
    id:      "yields",
    icon:    "trending",
    title:   "Find yield, skip the guesswork",
    body:    "Ask me for live APY rates on Marinade staking, Kamino lending pools, or Jupiter LP positions. I pull real numbers, not estimates.",
    tryMsg:  "What's the best yield right now?",
    tryLabel: "Find yields",
  },
  {
    id:      "execute",
    icon:    "zap",
    title:   "Execute — right from chat",
    body:    "When you're ready to move, I'll build the transaction. You review it, confirm, and your embedded wallet signs it on-chain. No browser extensions needed.",
    tryMsg:  "Stake 1 SOL on Marinade",
    tryLabel: "Try a trade",
  },
];

const MODE_STEP = {
  id:    "mode",
  icon:  "chat",
  title: "How should I talk to you?",
  body:  "You can change this any time in the chat.",
  options: [
    {
      mode:  "learn",
      label: "Walk me through it",
      sub:   "Explain what's happening and why — in plain language.",
    },
    {
      mode:  "ask",
      label: "Just the key insight",
      sub:   "Execute smart, add one sharp thing I should know.",
    },
    {
      mode:  "auto",
      label: "Execute and report",
      sub:   "I know DeFi. Be concise, skip the basics.",
    },
  ],
};

const ALL_STEPS = [...INFO_STEPS, MODE_STEP];
const TOTAL = ALL_STEPS.length;

function StepDot({ active, done }) {
  const scale = useSharedValue(active ? 1 : 0.65);
  React.useEffect(() => {
    scale.value = withTiming(active ? 1 : done ? 0.85 : 0.65, { duration: 280 });
  }, [active, done]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[styles.dot, aStyle, active && styles.dotActive, done && !active && styles.dotDone]}
    />
  );
}

function InfoCard({ step, visible }) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(24);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      ty.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = 0;
      ty.value = 24;
    }
  }, [visible]);

  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }));
  if (!visible) return null;

  return (
    <Animated.View style={[styles.stepCard, aStyle]}>
      <View style={styles.stepIconBox}>
        {step.icon === "paw"      && <PawPrint size={36} color="#FFFFFF" strokeWidth={1.5} />}
        {step.icon === "wallet"   && <Wallet size={36} color="#FFFFFF" strokeWidth={1.5} />}
        {step.icon === "trending" && <TrendingUp size={36} color="#FFFFFF" strokeWidth={1.5} />}
        {step.icon === "zap"      && <Zap size={36} color="#FFFFFF" strokeWidth={1.5} />}
      </View>
      <Text style={styles.stepTitle}>{step.title}</Text>
      <Text style={styles.stepBody}>{step.body}</Text>
    </Animated.View>
  );
}

function ModeCard({ visible, selectedMode, onSelect }) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(24);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      ty.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = 0;
      ty.value = 24;
    }
  }, [visible]);

  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }));
  if (!visible) return null;

  return (
    <Animated.View style={[styles.stepCard, aStyle]}>
      <View style={styles.stepIconBox}>
        <MessageCircle size={36} color="#FFFFFF" strokeWidth={1.5} />
      </View>
      <Text style={styles.stepTitle}>{MODE_STEP.title}</Text>
      <Text style={[styles.stepBody, { marginBottom: 8 }]}>{MODE_STEP.body}</Text>
      <View style={styles.modeOptions}>
        {MODE_STEP.options.map((opt) => {
          const selected = selectedMode === opt.mode;
          return (
            <TouchableOpacity
              key={opt.mode}
              style={[styles.modeOption, selected && styles.modeOptionSelected]}
              onPress={() => onSelect(opt.mode)}
              activeOpacity={0.75}
            >
              <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{opt.label}</Text>
              <Text style={styles.modeSub}>{opt.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

export async function shouldShowOnboarding() {
  try {
    const val = await AsyncStorage.getItem(ONBOARDED_KEY);
    return val === null;
  } catch {
    return false;
  }
}

export async function markOnboarded() {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, "1");
  } catch {}
}

export async function getSavedTradeMode() {
  try {
    return (await AsyncStorage.getItem(TRADE_MODE_KEY)) || "ask";
  } catch {
    return "ask";
  }
}

/**
 * @param {{ visible: boolean, onClose: () => void, onTryMessage: (msg: string) => void, onModeSelected: (mode: string) => void }} props
 */
export default function OnboardingSheet({ visible, onClose, onTryMessage, onModeSelected }) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState("ask");
  const isModeStep = step === ALL_STEPS.length - 1;
  const currentInfo = !isModeStep ? INFO_STEPS[step] : null;

  function handleNext() {
    if (step < ALL_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  async function handleFinish() {
    await markOnboarded();
    try {
      await AsyncStorage.setItem(TRADE_MODE_KEY, selectedMode);
    } catch {}
    onModeSelected?.(selectedMode);
    onClose();
  }

  function handleTry() {
    markOnboarded();
    if (currentInfo) {
      onTryMessage(currentInfo.tryMsg);
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleFinish}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>

          {/* Skip */}
          <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* Step dots */}
          <View style={styles.dots}>
            {ALL_STEPS.map((s, i) => (
              <StepDot key={s.id} active={i === step} done={i < step} />
            ))}
          </View>

          {/* Step content */}
          <View style={styles.cardArea}>
            {INFO_STEPS.map((s, i) => (
              <InfoCard key={s.id} step={s} visible={i === step} />
            ))}
            <ModeCard
              visible={isModeStep}
              selectedMode={selectedMode}
              onSelect={setSelectedMode}
            />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!isModeStep && (
              <TouchableOpacity style={styles.tryBtn} onPress={handleTry} activeOpacity={0.8}>
                <Text style={styles.tryBtnText}>{currentInfo?.tryLabel}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
              <Text style={styles.nextBtnText}>
                {step < ALL_STEPS.length - 1 ? "Next  →" : "Let's go"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Step counter */}
          <Text style={styles.counter}>{step + 1} / {TOTAL}</Text>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0e0e0e",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderBottomWidth: 0,
    minHeight: 440,
  },

  skipBtn:  { position: "absolute", top: 22, right: 24 },
  skipText: { color: TEXT_MUTED, fontSize: 14, fontWeight: "600" },

  dots: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 28,
  },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  dotActive: { backgroundColor: GREEN, width: 22, borderRadius: 4 },
  dotDone:   { backgroundColor: "rgba(74,222,128,0.45)" },

  cardArea: {
    minHeight: 240,
    justifyContent: "center",
  },
  stepCard: {
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 16,
  },
  stepIconBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  stepTitle: { color: TEXT_PRI, fontSize: 22, fontWeight: "800", textAlign: "center" },
  stepBody:  { color: TEXT_SEC, fontSize: 15, lineHeight: 24, textAlign: "center", marginTop: 4 },

  modeOptions: { width: "100%", gap: 10, marginTop: 4 },
  modeOption: {
    backgroundColor: GLASS,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: GLASS_BDR,
  },
  modeOptionSelected: {
    backgroundColor: "rgba(74,222,128,0.10)",
    borderColor: "rgba(74,222,128,0.45)",
  },
  modeLabel:         { color: TEXT_SEC,  fontSize: 15, fontWeight: "700" },
  modeLabelSelected: { color: GREEN },
  modeSub:           { color: TEXT_MUTED, fontSize: 13, marginTop: 3 },

  actions: { marginTop: 32, gap: 12 },
  tryBtn: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.30)",
  },
  tryBtnText: { color: GREEN, fontSize: 15, fontWeight: "800" },

  nextBtn: {
    backgroundColor: GLASS_MED,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GLASS_BDR,
  },
  nextBtnText: { color: TEXT_SEC, fontSize: 15, fontWeight: "700" },

  counter: { color: TEXT_MUTED, fontSize: 12, textAlign: "center", marginTop: 16 },
});
