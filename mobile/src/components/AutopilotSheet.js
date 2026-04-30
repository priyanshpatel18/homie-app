import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Zap, TrendingUp, Scale, Shield, Flame,
  Check, Bell, BellRing, BellOff, MousePointerClick,
  ShieldCheck, Infinity as InfinityIcon,
  Activity, PauseCircle, AlertTriangle,
  PanelBottom, SlidersHorizontal,
} from "lucide-react-native";
import { F } from "../theme/fonts";
import GradientButton from "./GradientButton";
import AgentActivitySheet from "./AgentActivitySheet";
import {
  AUTOPILOT_STRATEGIES, DRIFT_THRESHOLDS,
  saveAutopilot, loadAutopilot,
} from "../services/autopilotService";
import { loadConfirmThreshold, saveConfirmThreshold } from "../services/confirmSettings";
import {
  loadAgentSettings, saveAgentSettings,
  AUTO_EXECUTE_OPTS, SPENDING_CAP_OPTS,
} from "../services/agentSettings";
import { loadProfile, saveProfile } from "../services/userProfile";

const BG        = "#000000";
const GLASS     = "rgba(255,255,255,0.05)";
const GLASS_ON  = "rgba(74,222,128,0.07)";
const GLASS_RED = "rgba(248,113,113,0.07)";
const BDR       = "rgba(255,255,255,0.09)";
const BDR_ON    = "rgba(74,222,128,0.35)";
const BDR_RED   = "rgba(248,113,113,0.30)";
const GREEN     = "#4ADE80";
const RED       = "#F87171";
const WARN      = "#FBBF24";
const MUTED     = "rgba(255,255,255,0.30)";
const SEC       = "rgba(255,255,255,0.55)";

const STRATEGY_ICON = {
  yield:        { Icon: TrendingUp, color: "#4ADE80" },
  balanced:     { Icon: Scale,      color: "#FBBF24" },
  preservation: { Icon: Shield,     color: "#60A5FA" },
  aggressive:   { Icon: Flame,      color: "#F87171" },
};

const THRESHOLD_ICON = {
  5:  { Icon: BellRing, color: "#F87171" },
  10: { Icon: Bell,     color: "#FBBF24" },
  20: { Icon: BellOff,  color: "#60A5FA" },
};

const CONFIRM_STYLE_OPTS = [
  {
    value: "panel",
    label: "Review Panel",
    desc:  "See full tx details in a bottom sheet before signing. Tap Confirm & Sign.",
    Icon:  PanelBottom,
    color: "#60A5FA",
  },
  {
    value: "slider",
    label: "Slide to Confirm",
    desc:  "One gesture signs the tx — no extra panel. Fast and clean.",
    Icon:  SlidersHorizontal,
    color: "#4ADE80",
  },
];

const CONFIRM_OPTS = [
  { value: null,  label: "Always confirm",   desc: "Every transaction shows a modal — you stay in control.",   Icon: ShieldCheck,       color: "#60A5FA" },
  { value: 25,    label: "Auto under $25",   desc: "Small trades execute immediately. Bigger ones still ask.", Icon: MousePointerClick, color: "#4ADE80" },
  { value: 100,   label: "Auto under $100",  desc: "Routine trades go through. Large moves still confirm.",    Icon: MousePointerClick, color: "#FBBF24" },
  { value: 99999, label: "Auto-execute all", desc: "High-risk trades always ask regardless of size.",          Icon: InfinityIcon,      color: "#F87171" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AllocBars({ targets }) {
  const bars = [
    { label: "Liquid",  pct: targets.liquid,  color: "#60A5FA" },
    { label: "Staked",  pct: targets.staked,  color: "#4ADE80" },
    { label: "Lending", pct: targets.lending, color: "#FBBF24" },
  ];
  return (
    <View style={s.allocRow}>
      {bars.map(({ label, pct, color }) => (
        <View key={label} style={s.allocItem}>
          <View style={[s.allocTrack, { backgroundColor: color + "18", borderColor: color + "30" }]}>
            <View style={[s.allocFill, { width: `${pct}%`, backgroundColor: color + "70" }]} />
          </View>
          <Text style={[s.allocLabel, { color: color + "BB" }]}>{label} {pct}%</Text>
        </View>
      ))}
    </View>
  );
}

function StrategyCard({ strategy, selected, onPress }) {
  const { Icon, color } = STRATEGY_ICON[strategy.id] ?? { Icon: Zap, color: GREEN };
  return (
    <TouchableOpacity style={[s.card, selected && s.cardSelected]} onPress={onPress} activeOpacity={0.75}>
      <View style={s.cardTop}>
        <View style={[s.iconBox, { backgroundColor: `${color}12`, borderColor: selected ? `${color}40` : BDR }]}>
          <Icon size={18} color={selected ? color : SEC} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardName, selected && { color: "#fff" }]}>{strategy.name}</Text>
          <Text style={[s.cardApy, { color: selected ? color : MUTED }]}>{strategy.estimatedApy} APY</Text>
        </View>
        <View style={[s.check, selected && { backgroundColor: GREEN, borderColor: GREEN }]}>
          {selected && <Check size={11} color="#000" strokeWidth={3} />}
        </View>
      </View>
      <Text style={s.cardDesc}>{strategy.desc}</Text>
      <AllocBars targets={strategy.targets} />
    </TouchableOpacity>
  );
}

function ThresholdOption({ option, selected, onPress }) {
  const { Icon, color } = THRESHOLD_ICON[option.value] ?? { Icon: Bell, color: SEC };
  return (
    <TouchableOpacity style={[s.threshCard, selected && s.threshCardSelected]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.threshIconBox, { backgroundColor: `${color}12`, borderColor: selected ? `${color}40` : BDR }]}>
        <Icon size={15} color={selected ? color : SEC} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.threshLabel, selected && { color: "#fff" }]}>{option.label}</Text>
        <Text style={s.threshDesc}>{option.desc}</Text>
      </View>
      <View style={[s.check, selected && { backgroundColor: GREEN, borderColor: GREEN }]}>
        {selected && <Check size={11} color="#000" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

function ConfirmOpt({ opt, selected, onPress }) {
  const { Icon, color } = opt;
  return (
    <TouchableOpacity style={[s.threshCard, selected && s.threshCardSelected]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.threshIconBox, { backgroundColor: `${color}12`, borderColor: selected ? `${color}40` : BDR }]}>
        <Icon size={15} color={selected ? color : SEC} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.threshLabel, selected && { color: "#fff" }]}>{opt.label}</Text>
        <Text style={s.threshDesc}>{opt.desc}</Text>
      </View>
      <View style={[s.check, selected && { backgroundColor: GREEN, borderColor: GREEN }]}>
        {selected && <Check size={11} color="#000" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Auto-execute toggle row ──────────────────────────────────────────────────

function AutoExecuteRow({ opt, enabled, onToggle }) {
  const riskDot = opt.riskColor;
  return (
    <View style={[s.aeRow, enabled && s.aeRowOn]}>
      <View style={{ flex: 1 }}>
        <View style={s.aeLabelRow}>
          <Text style={[s.aeLabel, enabled && { color: "#fff" }]}>{opt.label}</Text>
          <View style={[s.riskPill, { backgroundColor: riskDot + "18", borderColor: riskDot + "35" }]}>
            <Text style={[s.riskPillText, { color: riskDot }]}>{opt.risk}</Text>
          </View>
        </View>
        <Text style={s.aeDesc}>{opt.desc}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: "rgba(255,255,255,0.10)", true: GREEN + "80" }}
        thumbColor={enabled ? GREEN : "rgba(255,255,255,0.40)"}
      />
    </View>
  );
}

// ─── Spending cap option ──────────────────────────────────────────────────────

function SpendingCapOpt({ opt, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.capOpt, selected && s.capOptSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.capLabel, selected && { color: GREEN }]}>{opt.label}</Text>
      {selected && <Check size={11} color={GREEN} strokeWidth={3} />}
    </TouchableOpacity>
  );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export default function AutopilotSheet({ visible, walletAddress, onClose, onSaved }) {
  const [strategyId,       setStrategyId]       = useState("balanced");
  const [driftThreshold,   setDriftThreshold]   = useState(10);
  const [enabled,          setEnabled]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [existing,         setExisting]         = useState(null);
  const [confirmThreshold, setConfirmThreshold] = useState(null);
  const [confirmStyle,    setConfirmStyle]    = useState("panel");

  // Agent settings
  const [isPaused,      setIsPaused]      = useState(false);
  const [spendingCap,   setSpendingCap]   = useState(500);
  const [autoExecute,   setAutoExecute]   = useState({
    compoundRewards: true, rebalanceLp: true, moveBetweenLending: false, autoRepay: false,
  });

  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    if (!visible || !walletAddress) return;

    loadAutopilot(walletAddress).then((cfg) => {
      if (cfg) {
        setExisting(cfg);
        setStrategyId(cfg.strategyId ?? "balanced");
        setDriftThreshold(cfg.driftThreshold ?? 10);
        setEnabled(cfg.enabled ?? true);
      }
    }).catch(() => {});

    loadConfirmThreshold().then((val) => setConfirmThreshold(val ?? null)).catch(() => {});

    loadProfile(walletAddress).then((p) => {
      setConfirmStyle(p?.confirmStyle ?? "panel");
    }).catch(() => {});

    loadAgentSettings(walletAddress).then((s) => {
      setIsPaused(s.isPaused ?? false);
      setSpendingCap(s.spendingCapUsd ?? 500);
      setAutoExecute({ ...autoExecute, ...(s.autoExecute || {}) });
    }).catch(() => {});
  }, [visible, walletAddress]);

  function toggleAutoExecute(key) {
    setAutoExecute((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfirmThreshold(confirmThreshold === 99999 ? 99999 : confirmThreshold);
      await saveProfile(walletAddress, { confirmStyle });
      const config = { strategyId, driftThreshold, enabled };
      const saved  = await saveAutopilot(walletAddress, config);
      await saveAgentSettings(walletAddress, {
        isPaused,
        spendingCapUsd: spendingCap,
        autoExecute,
      });
      onSaved?.(saved);
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setSaving(true);
    await saveAutopilot(walletAddress, { ...existing, enabled: false });
    setSaving(false);
    onSaved?.({ ...existing, enabled: false });
    onClose?.();
  }

  async function handleEmergencyPause() {
    const next = !isPaused;
    setIsPaused(next);
    await saveAgentSettings(walletAddress, { isPaused: next, spendingCapUsd: spendingCap, autoExecute });
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={false}>
        <SafeAreaView style={s.root}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={s.headerRow}>
              <View style={s.headerIconBox}>
                <Zap size={16} color={GREEN} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Autopilot</Text>
                <Text style={s.sub}>Monitor your portfolio and automate safe actions.</Text>
              </View>
            </View>

            {/* Activity log button */}
            <TouchableOpacity
              style={s.activityBtn}
              onPress={() => setShowActivity(true)}
              activeOpacity={0.7}
            >
              <Activity size={15} color={SEC} strokeWidth={1.8} />
              <Text style={s.activityBtnText}>View agent activity log</Text>
              <Text style={s.activityBtnChevron}>›</Text>
            </TouchableOpacity>

            {/* Enabled toggle */}
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Autopilot active</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: "rgba(255,255,255,0.10)", true: GREEN + "80" }}
                thumbColor={enabled ? GREEN : "rgba(255,255,255,0.40)"}
              />
            </View>

            {/* Strategy */}
            <Text style={s.sectionLabel}>STRATEGY</Text>
            <View style={s.group}>
              {Object.values(AUTOPILOT_STRATEGIES).map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  selected={strategyId === strategy.id}
                  onPress={() => setStrategyId(strategy.id)}
                />
              ))}
            </View>

            {/* Drift threshold */}
            <Text style={s.sectionLabel}>ALERT WHEN DRIFT EXCEEDS</Text>
            <View style={s.group}>
              {DRIFT_THRESHOLDS.map((opt) => (
                <ThresholdOption
                  key={opt.value}
                  option={opt}
                  selected={driftThreshold === opt.value}
                  onPress={() => setDriftThreshold(opt.value)}
                />
              ))}
            </View>

            {/* Confirm threshold */}
            <Text style={s.sectionLabel}>TRANSACTION CONFIRMATIONS</Text>
            <View style={s.group}>
              {CONFIRM_OPTS.map((opt) => (
                <ConfirmOpt
                  key={String(opt.value)}
                  opt={opt}
                  selected={confirmThreshold === opt.value}
                  onPress={() => setConfirmThreshold(opt.value)}
                />
              ))}
            </View>

            {/* Confirm style */}
            <Text style={s.sectionLabel}>SIGN CONFIRMATION STYLE</Text>
            <View style={s.group}>
              {CONFIRM_STYLE_OPTS.map((opt) => (
                <ConfirmOpt
                  key={opt.value}
                  opt={opt}
                  selected={confirmStyle === opt.value}
                  onPress={() => setConfirmStyle(opt.value)}
                />
              ))}
            </View>

            {/* Auto-execute controls */}
            <Text style={s.sectionLabel}>AUTO-EXECUTE PERMISSIONS</Text>
            <Text style={s.sectionSub}>
              Choose which actions the agent can take without asking. High-risk actions (close position, unwind leverage, move {">"} $1,000) always require your approval regardless of these settings.
            </Text>
            <View style={[s.group, { gap: 8 }]}>
              {AUTO_EXECUTE_OPTS.map((opt) => (
                <AutoExecuteRow
                  key={opt.key}
                  opt={opt}
                  enabled={autoExecute[opt.key] ?? false}
                  onToggle={() => toggleAutoExecute(opt.key)}
                />
              ))}
            </View>

            {/* Spending cap */}
            <Text style={s.sectionLabel}>SPENDING CAP PER AUTO-TX</Text>
            <View style={[s.group, { flexDirection: "row", flexWrap: "wrap", gap: 8 }]}>
              {SPENDING_CAP_OPTS.map((opt) => (
                <SpendingCapOpt
                  key={opt.value}
                  opt={opt}
                  selected={spendingCap === opt.value}
                  onPress={() => setSpendingCap(opt.value)}
                />
              ))}
            </View>

            {/* Emergency pause — danger zone */}
            <Text style={s.sectionLabel}>AGENT CONTROL</Text>
            <TouchableOpacity
              style={[s.pauseBtn, isPaused && s.pauseBtnActive]}
              onPress={handleEmergencyPause}
              activeOpacity={0.75}
            >
              <View style={[s.pauseIconBox, isPaused && { backgroundColor: "rgba(248,113,113,0.18)", borderColor: "rgba(248,113,113,0.4)" }]}>
                <PauseCircle size={18} color={isPaused ? RED : SEC} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pauseLabel, isPaused && { color: RED }]}>
                  {isPaused ? "Agent paused — tap to resume" : "Pause all auto-execute"}
                </Text>
                <Text style={s.pauseDesc}>
                  {isPaused
                    ? "No actions will execute automatically until you resume."
                    : "Instantly stop all automated actions. Manual actions still work."}
                </Text>
              </View>
              <View style={[s.pausePill, isPaused && { backgroundColor: "rgba(248,113,113,0.15)", borderColor: RED }]}>
                <Text style={[s.pausePillText, isPaused && { color: RED }]}>
                  {isPaused ? "PAUSED" : "ACTIVE"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Trust note */}
            <View style={s.trustNote}>
              <AlertTriangle size={12} color={MUTED} strokeWidth={1.8} />
              <Text style={s.trustNoteText}>
                Keys never leave your device. The agent can only act within the permissions above. Revoke any permission instantly.
              </Text>
            </View>

          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <GradientButton onPress={handleSave} disabled={saving} paddingVertical={17}>
              <Text style={s.saveText}>
                {saving ? "Saving..." : existing ? "Update Settings" : "Activate Autopilot"}
              </Text>
            </GradientButton>

            {existing?.enabled && (
              <TouchableOpacity style={s.disableBtn} onPress={handleDisable} activeOpacity={0.7}>
                <Text style={s.disableText}>Turn off autopilot</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <AgentActivitySheet
        visible={showActivity}
        walletAddress={walletAddress}
        onClose={() => setShowActivity(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 20 },
  headerIconBox: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.10)",
    borderWidth: 1, borderColor: "rgba(74,222,128,0.22)",
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  title: { color: "#fff", fontSize: 22, fontFamily: F.headBold, letterSpacing: -0.4, marginBottom: 4 },
  sub:   { color: SEC, fontSize: 13, fontFamily: F.regular, lineHeight: 19 },

  activityBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: GLASS, borderRadius: 12, borderWidth: 1, borderColor: BDR,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 20,
  },
  activityBtnText:    { color: SEC, fontSize: 13, fontFamily: F.medium, flex: 1 },
  activityBtnChevron: { color: MUTED, fontSize: 18, fontFamily: F.medium },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BDR,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 28,
  },
  toggleLabel: { color: "#fff", fontSize: 15, fontFamily: F.semibold },

  sectionLabel: { color: MUTED, fontSize: 10, fontFamily: F.semibold, letterSpacing: 1.4, marginBottom: 6 },
  sectionSub:   { color: MUTED, fontSize: 12, fontFamily: F.regular, lineHeight: 17, marginBottom: 10 },
  group:        { gap: 10, marginBottom: 28 },

  card:         { backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: BDR, padding: 16, gap: 10 },
  cardSelected: { backgroundColor: GLASS_ON, borderColor: BDR_ON },
  cardTop:      { flexDirection: "row", alignItems: "center", gap: 14 },
  iconBox: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  cardName: { color: SEC, fontSize: 15, fontFamily: F.semibold, marginBottom: 2 },
  cardApy:  { fontSize: 12, fontFamily: F.medium },
  cardDesc: { color: MUTED, fontSize: 12, fontFamily: F.regular, lineHeight: 18 },

  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: BDR,
    alignItems: "center", justifyContent: "center",
  },

  allocRow:  { gap: 5 },
  allocItem: { gap: 3 },
  allocTrack: { height: 5, borderRadius: 3, borderWidth: 1, overflow: "hidden" },
  allocFill:  { height: "100%", borderRadius: 3 },
  allocLabel: { fontSize: 10, fontFamily: F.medium },

  threshCard:         { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: BDR, padding: 16 },
  threshCardSelected: { backgroundColor: GLASS_ON, borderColor: BDR_ON },
  threshIconBox: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  threshLabel: { color: SEC, fontSize: 14, fontFamily: F.semibold, marginBottom: 2 },
  threshDesc:  { color: MUTED, fontSize: 12, fontFamily: F.regular },

  // Auto-execute rows
  aeRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BDR,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  aeRowOn:   { backgroundColor: GLASS_ON, borderColor: BDR_ON },
  aeLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  aeLabel:   { color: SEC, fontSize: 14, fontFamily: F.semibold, flex: 1 },
  aeDesc:    { color: MUTED, fontSize: 12, fontFamily: F.regular, lineHeight: 17 },
  riskPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
    borderWidth: 1,
  },
  riskPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Spending cap options
  capOpt: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: GLASS, borderRadius: 10, borderWidth: 1, borderColor: BDR,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  capOptSelected: { backgroundColor: GLASS_ON, borderColor: BDR_ON },
  capLabel: { color: SEC, fontSize: 13, fontFamily: F.medium },

  // Emergency pause
  pauseBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: BDR,
    padding: 16, marginBottom: 16,
  },
  pauseBtnActive: { backgroundColor: GLASS_RED, borderColor: BDR_RED },
  pauseIconBox: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GLASS, borderWidth: 1, borderColor: BDR,
  },
  pauseLabel: { color: SEC, fontSize: 14, fontFamily: F.semibold, marginBottom: 2 },
  pauseDesc:  { color: MUTED, fontSize: 12, fontFamily: F.regular, lineHeight: 17 },
  pausePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BDR,
  },
  pausePillText: { color: MUTED, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  trustNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: GLASS, borderRadius: 12, borderWidth: 1, borderColor: BDR,
    padding: 12, marginBottom: 8,
  },
  trustNoteText: { color: MUTED, fontSize: 11, fontFamily: F.regular, lineHeight: 16, flex: 1 },

  footer:      { paddingHorizontal: 24, paddingBottom: 28, gap: 4 },
  saveText:    { color: "#000", fontSize: 16, fontFamily: F.headBold },
  disableBtn:  { alignItems: "center", paddingVertical: 10 },
  disableText: { color: RED, fontSize: 14, fontFamily: F.medium },
  cancelBtn:   { alignItems: "center", paddingVertical: 10 },
  cancelText:  { color: MUTED, fontSize: 14, fontFamily: F.medium },
});
