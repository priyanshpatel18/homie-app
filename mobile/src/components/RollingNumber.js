/**
 * RollingNumber — digit pop-in animation matching transitions.dev reference.
 *
 * Each character fades in from below with blur → sharp, staggered per digit.
 * Fires on EVERY value change (initial load, balance updates, real↔sandbox).
 * No odometer — pure pop-in only.
 *
 * Built on Reanimated 4.x. No extra deps required.
 */
import { memo, useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

// ─── Animation config (mirrors transitions.dev CSS vars) ─────────────────────
const DIGIT_DUR      = 500;   // --digit-dur
const DIGIT_DISTANCE = 8;     // --digit-distance (px, direction: upward)
const DIGIT_STAGGER  = 70;    // --digit-stagger (ms between each char)
const BLUR_RADIUS    = 3;     // --digit-blur (px)

// cubic-bezier(0.34, 1.45, 0.64, 1) — the slightly bouncy ease from the ref
const DIGIT_EASE = Easing.bezier(0.34, 1.45, 0.64, 1);

// 4 cardinal-direction shadow copies simulate CSS filter: blur()
const BLUR_DIRS = [
  { dx:  1, dy:  0 },
  { dx: -1, dy:  0 },
  { dx:  0, dy:  1 },
  { dx:  0, dy: -1 },
];

// ─── Blur shadow layer ──────────────────────────────────────────────────────
const BlurShadow = memo(function BlurShadow({ dx, dy, blurProgress, children }) {
  const s = useAnimatedStyle(() => ({
    opacity: blurProgress.value * 0.38,
    transform: [
      { translateX: blurProgress.value * BLUR_RADIUS * dx },
      { translateY: blurProgress.value * BLUR_RADIUS * dy },
    ],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s]} pointerEvents="none">
      {children}
    </Animated.View>
  );
});

// ─── Single character with pop-in ────────────────────────────────────────────
const PopDigit = memo(function PopDigit({ char, digitH, style, index, epoch }) {
  const opacity  = useSharedValue(0);
  const transY   = useSharedValue(DIGIT_DISTANCE);
  const blurProg = useSharedValue(1);

  // Fire pop-in on mount and every time epoch bumps (= value changed)
  useEffect(() => {
    const delay = index * DIGIT_STAGGER;

    // Reset to starting state
    opacity.value  = 0;
    transY.value   = DIGIT_DISTANCE;
    blurProg.value = 1;

    // Animate in
    opacity.value  = withDelay(delay, withTiming(1, { duration: DIGIT_DUR, easing: DIGIT_EASE }));
    transY.value   = withDelay(delay, withTiming(0, { duration: DIGIT_DUR, easing: DIGIT_EASE }));
    blurProg.value = withDelay(delay, withTiming(0, { duration: DIGIT_DUR, easing: DIGIT_EASE }));
  }, [epoch]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: transY.value }],
  }));

  const content = <Text style={[style, { lineHeight: digitH }]}>{char}</Text>;

  return (
    <Animated.View style={popStyle}>
      <View>
        {content}
        {BLUR_DIRS.map(({ dx, dy }, i) => (
          <BlurShadow key={i} dx={dx} dy={dy} blurProgress={blurProg}>
            {content}
          </BlurShadow>
        ))}
      </View>
    </Animated.View>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────
export default function RollingNumber({
  value,
  fontSize = 32,
  color = "#FFFFFF",
  fontWeight = "800",
}) {
  const digitH    = Math.ceil(fontSize * 1.18);
  const charStyle = { fontSize, color, fontWeight, includeFontPadding: false };
  const str       = String(value ?? "—");

  // Epoch increments on every value change → triggers pop-in replay
  const prevValue = useRef(str);
  const epoch     = useRef(0);
  if (prevValue.current !== str) {
    epoch.current++;
    prevValue.current = str;
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: digitH }}>
      {[...str].map((char, i) => (
        <PopDigit
          key={i}
          char={char}
          digitH={digitH}
          style={charStyle}
          index={i}
          epoch={epoch.current}
        />
      ))}
    </View>
  );
}
