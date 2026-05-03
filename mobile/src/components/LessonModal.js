import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Animated, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { F } from "../theme/fonts";
import { addXP, markLessonDone } from "../services/progressService";
import { LESSONS } from "../lessons/lessonCatalog";
import { API_URL } from "../services/api";

// Module-level rate cache shared across modal opens
let _ratesCache = null;
let _ratesCacheTime = 0;
async function fetchLiveRates() {
  if (_ratesCache && Date.now() - _ratesCacheTime < 5 * 60 * 1000) return _ratesCache;
  try {
    const res = await fetch(`${API_URL}/api/rates`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`rates ${res.status}`);
    _ratesCache = await res.json();
    _ratesCacheTime = Date.now();
    return _ratesCache;
  } catch {
    return null;
  }
}

const { width: SW } = Dimensions.get("window");

const GREEN  = "#4ADE80";
const BG     = "#000000";
const GLASS  = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED  = "rgba(255,255,255,0.4)";
const SEC    = "rgba(255,255,255,0.6)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(n) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

// Compute context-specific numbers from portfolio for your_numbers steps
function resolveDataKey(dataKey, portfolio, solPriceUsd = 150) {
  if (!portfolio) return null;
  const sol = portfolio.solBalance ?? 0;
  const APY = 0.075;

  switch (dataKey) {
    case "solBalance":
      return { value: sol.toFixed(4), unit: "SOL", sub: formatUsd(sol * solPriceUsd) };
    case "stakingProjection": {
      const annual = sol * solPriceUsd * APY;
      return { value: formatUsd(annual), unit: "/ year", sub: `at 7.5% APY on ${sol.toFixed(3)} SOL` };
    }
    case "liquidStakingProjection": {
      const annual = sol * solPriceUsd * 0.081;
      return { value: formatUsd(annual), unit: "/ year", sub: `at 8.1% APY (INF) on ${sol.toFixed(3)} SOL` };
    }
    case "idleSolOpportunityCost": {
      const cost = sol * solPriceUsd * APY;
      return { value: formatUsd(cost), unit: "/ year missed", sub: `${sol.toFixed(3)} SOL sitting idle` };
    }
    default:
      return null;
  }
}

// ─── Step renderers ───────────────────────────────────────────────────────────

function SplashStep({ step }) {
  return (
    <View style={r.stepWrap}>
      <Text style={r.splashEmoji}>{step.emoji}</Text>
      <Text style={r.splashTitle}>{step.title}</Text>
      <Text style={r.splashSub}>{step.subtitle}</Text>
    </View>
  );
}

function ComparisonStep({ step }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={r.stepWrap} showsVerticalScrollIndicator={false}>
      <Text style={r.compTitle}>{step.title}</Text>
      <View style={r.compRow}>
        {/* Left */}
        <View style={[r.compCard, r.compCardLeft]}>
          <Text style={r.compCardEmoji}>{step.leftEmoji}</Text>
          <Text style={r.compCardLabel}>{step.leftLabel}</Text>
          {step.leftPoints.map((p, i) => (
            <View key={i} style={r.compPoint}>
              <Text style={r.compBullet}>•</Text>
              <Text style={r.compPointText}>{p}</Text>
            </View>
          ))}
        </View>
        {/* Right */}
        <View style={[r.compCard, r.compCardRight]}>
          <Text style={r.compCardEmoji}>{step.rightEmoji}</Text>
          <Text style={r.compCardLabel}>{step.rightLabel}</Text>
          {step.rightPoints.map((p, i) => (
            <View key={i} style={r.compPoint}>
              <Text style={r.compBullet}>•</Text>
              <Text style={r.compPointText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function YourNumbersStep({ step, portfolio }) {
  const data = resolveDataKey(step.dataKey, portfolio);
  return (
    <View style={r.stepWrap}>
      <Text style={r.yourNumTitle}>{step.title}</Text>
      <Text style={r.yourNumDesc}>{step.desc}</Text>
      <View style={r.yourNumCard}>
        {data ? (
          <>
            <Text style={r.yourNumValue}>{data.value}</Text>
            <Text style={r.yourNumUnit}>{data.unit}</Text>
            {data.sub ? <Text style={r.yourNumSub}>{data.sub}</Text> : null}
          </>
        ) : (
          <Text style={r.yourNumValue}>—</Text>
        )}
      </View>
      {step.tip ? (
        <View style={r.tipBox}>
          <Text style={r.tipText}>{step.tip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const RATE_FIELDS = {
  "mSOL":    "marinade_apy",
  "jitoSOL": "jitosol_apy",
  "INF":     "sanctum_inf_apy",
};

function ApyChartStep({ step }) {
  const isApy = step.isLiveApy;
  const [bars, setBars] = useState(step.bars);

  useEffect(() => {
    if (!isApy) return;
    fetchLiveRates().then((rates) => {
      if (!rates) return;
      setBars((prev) =>
        prev.map((b) => {
          const field = RATE_FIELDS[b.label];
          const live = field ? rates[field] : null;
          return live != null ? { ...b, apy: parseFloat(live.toFixed(1)) } : b;
        }),
      );
    });
  }, [isApy]);

  const chartW = SW - 80;
  const chartH = 160;
  const barCount = bars.length;
  const gap = 10;
  const barW = (chartW - gap * (barCount + 1)) / barCount;

  const values = bars.map((b) => (isApy ? b.apy : (b.multiplier ?? 1) * 1000));
  const maxVal = Math.max(...values);

  return (
    <View style={r.stepWrap}>
      <Text style={r.chartTitle}>{step.title}</Text>
      <Text style={r.chartDesc}>{step.desc}</Text>

      <View style={r.chartWrap}>
        <Svg width={chartW} height={chartH + 40}>
          {bars.map((bar, i) => {
            const val = isApy ? bar.apy : (bar.multiplier ?? 1) * 1000;
            const barH = Math.max(8, (val / maxVal) * chartH);
            const x = gap + i * (barW + gap);
            const y = chartH - barH;
            const label = isApy ? `${bar.apy}%` : formatUsd(val);
            return (
              <React.Fragment key={i}>
                <Rect
                  x={x} y={y}
                  width={barW} height={barH}
                  rx={6}
                  fill={bar.color}
                />
                <SvgText
                  x={x + barW / 2} y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="rgba(255,255,255,0.8)"
                  fontFamily={F.medium}
                >
                  {label}
                </SvgText>
                <SvgText
                  x={x + barW / 2} y={chartH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.45)"
                  fontFamily={F.regular}
                >
                  {bar.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>

      {step.baseLabel ? (
        <Text style={r.chartBaseline}>{step.baseLabel}</Text>
      ) : null}
    </View>
  );
}

function QuizStep({ step, onAnswered }) {
  const [selected, setSelected] = useState(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  function pick(opt, idx) {
    if (selected !== null) return;
    setSelected(idx);

    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();

    setTimeout(() => onAnswered(opt.correct), 900);
  }

  return (
    <View style={r.stepWrap}>
      <Text style={r.quizQ}>{step.question}</Text>
      <View style={r.quizOptions}>
        {step.options.map((opt, i) => {
          const picked = selected === i;
          const correct = opt.correct;
          let bg = GLASS;
          let border = BORDER;
          let textColor = "#fff";
          if (picked && correct)  { bg = "rgba(74,222,128,0.18)";  border = GREEN;      textColor = GREEN; }
          if (picked && !correct) { bg = "rgba(248,113,113,0.15)"; border = "#F87171";  textColor = "#F87171"; }

          return (
            <TouchableOpacity
              key={i}
              style={[r.quizOption, { backgroundColor: bg, borderColor: border }]}
              onPress={() => pick(opt, i)}
              activeOpacity={0.75}
              disabled={selected !== null}
            >
              <Text style={[r.quizOptionText, { color: textColor }]}>{opt.text}</Text>
              {picked && (
                <Text style={r.quizOptionIcon}>{correct ? "✓" : "✗"}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {selected !== null && (
        <View style={r.quizExplain}>
          <Text style={r.quizExplainText}>{step.explanation}</Text>
        </View>
      )}
    </View>
  );
}

function CtaStep({ step, onClose, onOpenNextLesson }) {
  return (
    <View style={[r.stepWrap, r.ctaWrap]}>
      <Text style={r.ctaEmoji}>{step.emoji}</Text>
      <Text style={r.ctaTitle}>{step.title}</Text>
      <Text style={r.ctaDesc}>{step.desc}</Text>
      {step.nextLessonId && (
        <TouchableOpacity
          style={r.ctaPrimary}
          onPress={() => onOpenNextLesson(step.nextLessonId)}
          activeOpacity={0.85}
        >
          <Text style={r.ctaPrimaryText}>{step.actionLabel}</Text>
        </TouchableOpacity>
      )}
      {step.actionType === "wallet" && (
        <TouchableOpacity style={r.ctaPrimary} onPress={onClose} activeOpacity={0.85}>
          <Text style={r.ctaPrimaryText}>{step.actionLabel}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={r.ctaSecondary} onPress={onClose} activeOpacity={0.75}>
        <Text style={r.ctaSecondaryText}>Back to lessons</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function LessonModal({ lessonId, portfolio, visible, onClose, onComplete, onOpenLesson }) {
  const lesson = LESSONS[lessonId];
  const [stepIdx, setStepIdx] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const steps = lesson?.steps ?? [];
  const step  = steps[stepIdx] ?? null;
  const total = steps.length;

  // Reset when lesson changes
  useEffect(() => {
    if (visible && lesson) {
      setStepIdx(0);
      setQuizAnswered(false);
      setQuizCorrect(false);
      setXpAwarded(false);
      progressAnim.setValue(0);
    }
  }, [lessonId, visible]);

  // Animate progress bar
  useEffect(() => {
    if (!lesson) return;
    const pct = total > 1 ? stepIdx / (total - 1) : 1;
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [stepIdx, total]);

  async function handleContinue() {
    if (stepIdx < steps.length - 1) {
      setStepIdx((s) => s + 1);
      setQuizAnswered(false);
      setQuizCorrect(false);
    }
  }

  async function handleQuizAnswered(correct) {
    setQuizAnswered(true);
    setQuizCorrect(correct);

    // Award XP + mark done on last meaningful step before CTA
    const isLastQuiz = steps[stepIdx + 1]?.type === "cta" || stepIdx === steps.length - 2;
    if (isLastQuiz && !xpAwarded) {
      setXpAwarded(true);
      await addXP(lesson.xp);
      await markLessonDone(lesson.id);
      onComplete?.(lesson.id, lesson.xp);
    }
  }

  function handleNextLesson(nextId) {
    onClose?.();
    setTimeout(() => onOpenLesson?.(nextId), 300);
  }

  if (!lesson) return null;

  const isContinueBlocked = step?.type === "quiz" && !quizAnswered;
  const isLastStep        = stepIdx === steps.length - 1;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={r.root}>
        <SafeAreaView edges={["top"]} style={r.topBar}>
          {/* Progress bar */}
          <View style={r.progressTrack}>
            <Animated.View style={[r.progressFill, { width: progressWidth }]} />
          </View>

          {/* Close */}
          <TouchableOpacity style={r.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={r.closeTxt}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>

        {/* Lesson title */}
        <View style={r.titleRow}>
          <Text style={r.lessonTitleSmall}>{lesson.emoji} {lesson.title}</Text>
          <Text style={r.stepCounter}>{stepIdx + 1}/{total}</Text>
        </View>

        {/* Step content */}
        <View style={r.body}>
          {step?.type === "splash"       && <SplashStep step={step} />}
          {step?.type === "comparison"   && <ComparisonStep step={step} />}
          {step?.type === "your_numbers" && <YourNumbersStep step={step} portfolio={portfolio} />}
          {step?.type === "apy_chart"    && <ApyChartStep step={step} />}
          {step?.type === "quiz"         && (
            <QuizStep step={step} onAnswered={handleQuizAnswered} key={stepIdx} />
          )}
          {step?.type === "cta"          && (
            <CtaStep
              step={step}
              onClose={onClose}
              onOpenNextLesson={handleNextLesson}
            />
          )}
        </View>

        {/* Continue button — hidden on CTA (it has its own buttons) */}
        {step?.type !== "cta" && (
          <SafeAreaView edges={["bottom"]} style={r.footer}>
            {/* XP earned badge shown after quiz */}
            {step?.type === "quiz" && quizAnswered && xpAwarded && (
              <View style={r.xpBadge}>
                <Text style={r.xpBadgeText}>+{lesson.xp} XP earned!</Text>
              </View>
            )}
            <TouchableOpacity
              style={[r.continueBtn, isContinueBlocked && r.continueBtnDisabled]}
              onPress={handleContinue}
              disabled={isContinueBlocked}
              activeOpacity={0.85}
            >
              <Text style={[r.continueTxt, isContinueBlocked && r.continueTxtDisabled]}>
                {isLastStep ? "Finish" : "Continue"}
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const r = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GREEN,
    borderRadius: 3,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GLASS,
    alignItems: "center", justifyContent: "center",
  },
  closeTxt: { color: MUTED, fontSize: 14, fontFamily: F.medium },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  lessonTitleSmall: {
    color: SEC, fontSize: 13, fontFamily: F.medium, flex: 1,
  },
  stepCounter: {
    color: MUTED, fontSize: 12, fontFamily: F.regular,
  },

  body: { flex: 1, paddingHorizontal: 20 },

  // Splash
  stepWrap: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 16,
  },
  splashEmoji: { fontSize: 72, marginBottom: 8 },
  splashTitle: {
    color: "#fff", fontSize: 28, fontFamily: F.headBold,
    letterSpacing: -0.5, textAlign: "center",
  },
  splashSub: {
    color: SEC, fontSize: 16, fontFamily: F.regular,
    lineHeight: 26, textAlign: "center",
  },

  // Comparison
  compTitle: {
    color: "#fff", fontSize: 20, fontFamily: F.headBold,
    letterSpacing: -0.3, textAlign: "center", marginBottom: 16,
  },
  compRow: { flexDirection: "row", gap: 12, width: "100%" },
  compCard: {
    flex: 1, borderRadius: 18, borderWidth: 1, padding: 16, gap: 10,
  },
  compCardLeft: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  compCardRight: {
    backgroundColor: "rgba(74,222,128,0.07)",
    borderColor: "rgba(74,222,128,0.2)",
  },
  compCardEmoji: { fontSize: 28, marginBottom: 2 },
  compCardLabel: {
    color: "#fff", fontSize: 14, fontFamily: F.headSemi, marginBottom: 8,
  },
  compPoint: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  compBullet: { color: MUTED, fontSize: 13, lineHeight: 20 },
  compPointText: { color: SEC, fontSize: 13, fontFamily: F.regular, lineHeight: 20, flex: 1 },

  // Your numbers
  yourNumTitle: {
    color: "#fff", fontSize: 22, fontFamily: F.headBold,
    letterSpacing: -0.3, textAlign: "center",
  },
  yourNumDesc: {
    color: SEC, fontSize: 14, fontFamily: F.regular,
    lineHeight: 22, textAlign: "center",
  },
  yourNumCard: {
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    padding: 28, alignItems: "center", gap: 4, width: "100%",
  },
  yourNumValue: {
    color: GREEN, fontSize: 42, fontFamily: F.headBold, letterSpacing: -1,
  },
  yourNumUnit: { color: SEC, fontSize: 15, fontFamily: F.medium },
  yourNumSub:  { color: MUTED, fontSize: 13, fontFamily: F.regular, marginTop: 4 },
  tipBox: {
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 14, width: "100%",
  },
  tipText: { color: MUTED, fontSize: 13, fontFamily: F.regular, lineHeight: 20 },

  // APY chart
  chartTitle: {
    color: "#fff", fontSize: 20, fontFamily: F.headBold, textAlign: "center",
  },
  chartDesc: {
    color: SEC, fontSize: 13, fontFamily: F.regular,
    lineHeight: 20, textAlign: "center",
  },
  chartWrap: { alignItems: "center", marginVertical: 8 },
  chartBaseline: {
    color: MUTED, fontSize: 12, fontFamily: F.regular, marginTop: 4,
  },

  // Quiz
  quizQ: {
    color: "#fff", fontSize: 20, fontFamily: F.headBold,
    letterSpacing: -0.3, lineHeight: 30, marginBottom: 24, textAlign: "center",
    alignSelf: "center",
  },
  quizOptions: { gap: 10, width: "100%" },
  quizOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 16,
  },
  quizOptionText: { color: "#fff", fontSize: 15, fontFamily: F.medium, flex: 1, lineHeight: 22 },
  quizOptionIcon: { fontSize: 18, marginLeft: 8 },
  quizExplain: {
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(74,222,128,0.2)",
    padding: 14, marginTop: 16,
  },
  quizExplainText: {
    color: GREEN, fontSize: 13, fontFamily: F.regular, lineHeight: 20,
  },

  // CTA
  ctaWrap: { justifyContent: "center", gap: 20 },
  ctaEmoji: { fontSize: 64 },
  ctaTitle: {
    color: "#fff", fontSize: 28, fontFamily: F.headBold,
    letterSpacing: -0.5, textAlign: "center",
  },
  ctaDesc: {
    color: SEC, fontSize: 15, fontFamily: F.regular,
    lineHeight: 24, textAlign: "center",
  },
  ctaPrimary: {
    backgroundColor: GREEN, borderRadius: 20,
    paddingVertical: 18, paddingHorizontal: 32, width: "100%", alignItems: "center",
  },
  ctaPrimaryText: { color: "#000", fontSize: 16, fontFamily: F.headBold },
  ctaSecondary: {
    borderRadius: 20, paddingVertical: 14,
    alignItems: "center",
  },
  ctaSecondaryText: { color: MUTED, fontSize: 14, fontFamily: F.medium },

  // Footer
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  xpBadge: {
    backgroundColor: "rgba(251,191,36,0.15)",
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(251,191,36,0.3)",
    paddingVertical: 8, alignItems: "center",
  },
  xpBadgeText: { color: "#FBBF24", fontSize: 14, fontFamily: F.headSemi },
  continueBtn: {
    backgroundColor: GREEN, borderRadius: 20,
    paddingVertical: 18, alignItems: "center",
  },
  continueBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  continueTxt: { color: "#000", fontSize: 16, fontFamily: F.headBold },
  continueTxtDisabled: { color: MUTED },
});
