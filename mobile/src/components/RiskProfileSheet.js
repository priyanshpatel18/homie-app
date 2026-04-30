import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Shield, Scale, Flame,
  Coins, TrendingUp, Zap, Compass,
  Sprout, BookOpen, Cpu,
  Check,
} from "lucide-react-native";
import { F } from "../theme/fonts";
import GradientButton from "./GradientButton";
import { saveProfile, RISK_LABELS, GOAL_LABELS } from "../services/userProfile";

const BG    = "#000000";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_SEL = "rgba(74,222,128,0.07)";
const BDR   = "rgba(255,255,255,0.09)";
const BDR_SEL = "rgba(74,222,128,0.35)";
const GREEN = "#4ADE80";
const MUTED = "rgba(255,255,255,0.30)";
const SEC   = "rgba(255,255,255,0.55)";

// ─── Icon maps ────────────────────────────────────────────────────────────────
const RISK_ICON = {
  low:    { Icon: Shield,    color: "#60A5FA" },
  medium: { Icon: Scale,     color: "#FBBF24" },
  high:   { Icon: Flame,     color: "#F87171" },
};
const GOAL_ICON = {
  passive_income: { Icon: Coins,      color: "#4ADE80" },
  growth:         { Icon: TrendingUp, color: "#A78BFA" },
  trading:        { Icon: Zap,        color: "#FBBF24" },
  exploring:      { Icon: Compass,    color: "#60A5FA" },
};
const EXP_OPTIONS = [
  { key: "beginner",     label: "New to DeFi",     desc: "I'm just getting started",      Icon: Sprout,   color: "#4ADE80" },
  { key: "intermediate", label: "Know the basics",  desc: "I've used a few protocols",     Icon: BookOpen, color: "#FBBF24" },
  { key: "advanced",     label: "Full degen",       desc: "I know what I'm doing",         Icon: Cpu,      color: "#F87171" },
];

// ─── Single option card ───────────────────────────────────────────────────────
function OptionCard({ Icon, iconColor, label, desc, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.option, selected && s.optionSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[s.iconBox, { borderColor: selected ? `${iconColor}40` : BDR, backgroundColor: `${iconColor}12` }]}>
        <Icon size={18} color={selected ? iconColor : SEC} strokeWidth={1.8} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[s.optionLabel, selected && { color: "#fff" }]}>{label}</Text>
        <Text style={s.optionDesc}>{desc}</Text>
      </View>

      <View style={[s.check, selected && { backgroundColor: GREEN, borderColor: GREEN }]}>
        {selected && <Check size={11} color="#000" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────
export default function RiskProfileSheet({ visible, walletAddress, onDone, canSkip = true }) {
  const [step, setStep]      = useState(0);
  const [risk, setRisk]      = useState(null);
  const [goal, setGoal]      = useState(null);
  const [experience, setExp] = useState(null);
  const [saving, setSaving]  = useState(false);

  const STEPS = [
    {
      title:   "What's your risk level?",
      sub:     "Every suggestion Homie makes will match this.",
      options: Object.entries(RISK_LABELS).map(([k, v]) => ({
        key: k, label: v.label, desc: v.desc,
        ...RISK_ICON[k],
      })),
      value: risk, setValue: setRisk,
    },
    {
      title:   "What's your main goal?",
      sub:     "Homie will prioritise strategies that fit this.",
      options: Object.entries(GOAL_LABELS).map(([k, v]) => ({
        key: k, label: v.label, desc: v.desc,
        ...GOAL_ICON[k],
      })),
      value: goal, setValue: setGoal,
    },
    {
      title:   "How experienced are you?",
      sub:     "So Homie knows how much to explain.",
      options: EXP_OPTIONS,
      value: experience, setValue: setExp,
    },
  ];

  const current = STEPS[step];
  const canNext = !!current.value;
  const isLast  = step === STEPS.length - 1;

  async function handleNext() {
    if (!canNext) return;
    if (!isLast) { setStep((s) => s + 1); return; }
    setSaving(true);
    await saveProfile(walletAddress, { riskTolerance: risk, goal, experience });
    setSaving(false);
    onDone({ riskTolerance: risk, goal, experience });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={s.root}>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.stepLabel}>STEP {step + 1} OF {STEPS.length}</Text>
          <Text style={s.title}>{current.title}</Text>
          <Text style={s.sub}>{current.sub}</Text>

          <View style={s.options}>
            {current.options.map((opt) => (
              <OptionCard
                key={opt.key}
                Icon={opt.Icon}
                iconColor={opt.color}
                label={opt.label}
                desc={opt.desc}
                selected={current.value === opt.key}
                onPress={() => current.setValue(opt.key)}
              />
            ))}
          </View>
        </ScrollView>

        <View style={s.footer}>
          <GradientButton
            onPress={handleNext}
            disabled={!canNext || saving}
            paddingVertical={17}
          >
            <Text style={s.nextText}>
              {saving ? "Saving..." : isLast ? "Done" : "Continue"}
            </Text>
          </GradientButton>

          {canSkip && step === 0 && (
            <TouchableOpacity style={s.skipBtn} onPress={() => onDone(null)} activeOpacity={0.6}>
              <Text style={s.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },

  progressTrack: {
    height: 2, backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 0,
  },
  progressFill: {
    height: 2, backgroundColor: GREEN,
  },

  stepLabel: {
    color: MUTED, fontSize: 11, fontFamily: F.semibold,
    letterSpacing: 1.2, marginTop: 28, marginBottom: 14,
  },
  title: {
    color: "#fff", fontSize: 28, fontFamily: F.headBold,
    letterSpacing: -0.6, marginBottom: 8, lineHeight: 34,
  },
  sub: {
    color: SEC, fontSize: 14, fontFamily: F.regular,
    marginBottom: 32, lineHeight: 22,
  },

  options: { gap: 10 },

  option: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: GLASS, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BDR,
  },
  optionSelected: {
    backgroundColor: GLASS_SEL,
    borderColor: BDR_SEL,
  },

  iconBox: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },

  optionLabel: {
    color: SEC, fontSize: 15, fontFamily: F.semibold, marginBottom: 3,
  },
  optionDesc: {
    color: MUTED, fontSize: 12, fontFamily: F.regular, lineHeight: 17,
  },

  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: BDR,
    alignItems: "center", justifyContent: "center",
  },

  footer: { paddingHorizontal: 24, paddingBottom: 28, gap: 4 },
  nextText: { color: "#000", fontSize: 16, fontFamily: F.headBold },
  skipBtn:  { alignItems: "center", paddingVertical: 14 },
  skipText: { color: MUTED, fontSize: 13, fontFamily: F.medium },
});
