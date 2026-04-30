/**
 * SkiaLineChart — smooth chart with axes, touch crosshair & tooltip.
 * Lana-style: scrubbing updates parent header; tooltip shows price + time + Δ%.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import {
  Canvas, Path, LinearGradient, vec, Skia,
  Group, Circle, Line,
} from "@shopify/react-native-skia";
import {
  useSharedValue, withTiming, Easing, useDerivedValue,
} from "react-native-reanimated";
import { F } from "../theme/fonts";
import * as Haptics from "expo-haptics";

const PAD_LEFT   = 6;
const PAD_RIGHT  = 58;   // space for Y-axis labels
const PAD_TOP    = 10;
const PAD_BOTTOM = 28;   // space for X-axis labels
const Y_LABELS   = 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPrice(n) {
  if (n == null) return "";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toPrecision(4)}`;
}

function fmtAxisPrice(n) {
  if (n == null) return "";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function fmtTime(ts, range) {
  const d = new Date(ts);
  if (range === "1H" || range === "24H") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (range === "7D") {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  if (range === "30D") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtTooltipTime(ts, range) {
  const d = new Date(ts);
  if (range === "1H" || range === "24H") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  if (range === "7D") {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Compute nice round Y-axis levels
function niceYLabels(minVal, maxVal) {
  const range = maxVal - minVal || 1;
  const rawStep = range / (Y_LABELS - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps
    .map((s) => s * magnitude)
    .find((s) => s >= rawStep) ?? rawStep;
  const start = Math.ceil(minVal / step) * step;
  const labels = [];
  for (let v = start; v <= maxVal + step * 0.01 && labels.length < Y_LABELS + 1; v += step) {
    labels.push(parseFloat(v.toPrecision(6)));
  }
  return labels;
}

// ─── Build paths from price data ─────────────────────────────────────────────
function buildPaths(prices, canvasW, canvasH) {
  if (!prices || prices.length < 2) return null;

  const drawL = PAD_LEFT;
  const drawR = canvasW - PAD_RIGHT;
  const drawT = PAD_TOP;
  const drawB = canvasH - PAD_BOTTOM;
  const drawW = drawR - drawL;
  const drawH = drawB - drawT;

  const values = prices.map((p) => p.price);
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const range   = maxVal - minVal || 1;

  const pts = prices.map((p, i) => ({
    x: drawL + (i / (prices.length - 1)) * drawW,
    y: drawT + (1 - (p.price - minVal) / range) * drawH,
  }));

  const linePath = Skia.Path.Make();
  linePath.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const cur  = pts[i];
    const next = pts[i + 1];
    const cpX  = (cur.x + next.x) / 2;
    linePath.cubicTo(cpX, cur.y, cpX, next.y, next.x, next.y);
  }

  const fillPath = linePath.copy();
  fillPath.lineTo(pts[pts.length - 1].x, drawB);
  fillPath.lineTo(pts[0].x, drawB);
  fillPath.close();

  const yLabels = niceYLabels(minVal, maxVal).map((v) => ({
    value: v,
    y: drawT + (1 - (v - minVal) / range) * drawH,
    label: fmtAxisPrice(v),
  }));

  // X-axis: 5 evenly spaced time labels
  const xIndices = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    Math.min(prices.length - 1, Math.round(t * (prices.length - 1)))
  );
  const xLabels = xIndices.map((idx) => ({
    x:     pts[idx].x,
    label: prices[idx] ? fmtTime(prices[idx].ts, null) : "",
  }));

  return { linePath, fillPath, pts, minVal, maxVal, yLabels, xLabels, drawL, drawR, drawT, drawB };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SkiaLineChart({
  prices, width, height, positive = true, animate = true, range = "24H",
  onTouchActive,   // (touchData | null) => void — called by parent to show price in header
}) {
  const canvasW = width;
  const canvasH = height;

  const lineColor = positive ? "#4ADE80" : "#F87171";
  const gradTop   = positive ? "rgba(74,222,128,0.22)" : "rgba(248,113,113,0.22)";

  const paths = useMemo(
    () => buildPaths(prices, canvasW, canvasH),
    [prices, canvasW, canvasH]
  );

  // Recompute x labels with the correct range formatter
  const xLabels = useMemo(() => {
    if (!paths || !prices) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const idx = Math.min(prices.length - 1, Math.round(t * (prices.length - 1)));
      return {
        x:     paths.pts[idx].x,
        label: fmtTime(prices[idx].ts, range),
      };
    });
  }, [paths, prices, range]);

  // Draw animation
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    progress.value = animate ? withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }) : 1;
  }, [prices]);

  const clipRect = useDerivedValue(() => ({
    x: 0, y: 0,
    width:  canvasW * progress.value,
    height: canvasH,
  }));

  // Touch state
  const [touch, setTouch] = useState(null);
  const lastIdxRef = useRef(-1);

  const handleTouchMove = useCallback((rawX) => {
    if (!paths || !prices) return;
    const { pts, drawL, drawR } = paths;
    const drawW = drawR - drawL;
    const t     = Math.max(0, Math.min(1, (rawX - drawL) / drawW));
    const idx   = Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))));

    // Haptic tick when crossing to a new data point
    if (idx !== lastIdxRef.current) {
      lastIdxRef.current = idx;
      try { Haptics.selectionAsync(); } catch {}
    }

    const firstPrice  = prices[0].price;
    const touchPrice  = prices[idx].price;
    const changePct   = ((touchPrice - firstPrice) / firstPrice) * 100;

    const touchData = {
      x: pts[idx].x,
      y: pts[idx].y,
      price: touchPrice,
      ts: prices[idx].ts,
      changePct,
      idx,
    };

    setTouch(touchData);
    onTouchActive?.(touchData);
  }, [paths, prices, onTouchActive]);

  const handleTouchEnd = useCallback(() => {
    lastIdxRef.current = -1;
    setTouch(null);
    onTouchActive?.(null);
  }, [onTouchActive]);

  if (!paths) return <View style={{ width: canvasW, height: canvasH }} />;

  const { linePath, fillPath, pts, yLabels, drawT, drawB } = paths;
  const lastPt = pts[pts.length - 1];

  // Current price label Y — clamp so it stays visible
  const priceLabelY = Math.max(drawT + 4, Math.min(drawB - 16, lastPt.y - 8));

  // Tooltip clamped to card bounds
  const tooltipW    = 130;
  const tooltipLeft = touch ? Math.max(2, Math.min(canvasW - PAD_RIGHT - tooltipW - 4, touch.x - tooltipW / 2)) : 0;
  const tooltipTop  = touch ? Math.max(2, Math.min(drawT, touch.y - 56)) : 0;

  return (
    <View style={{ width: canvasW, height: canvasH }}>
      {/* Canvas — rendered first so it sits below touch responder in Z-order */}
      <Canvas style={StyleSheet.absoluteFill}>
        {yLabels.map((yl, i) => (
          <Line key={i} p1={vec(PAD_LEFT, yl.y)} p2={vec(canvasW - PAD_RIGHT, yl.y)} color="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}
        <Group clip={clipRect}>
          <Path path={fillPath} style="fill">
            <LinearGradient start={vec(0, drawT)} end={vec(0, drawB)} colors={[gradTop, "rgba(0,0,0,0)"]} />
          </Path>
          <Path path={linePath} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={lineColor} />
          {!touch && <Circle cx={lastPt.x} cy={lastPt.y} r={3.5} color={lineColor} />}
        </Group>
        {touch && (
          <>
            {/* Vertical crosshair */}
            <Line p1={vec(touch.x, drawT)} p2={vec(touch.x, drawB)} color="rgba(255,255,255,0.22)" strokeWidth={StyleSheet.hairlineWidth} />
            {/* Horizontal crosshair */}
            <Line p1={vec(PAD_LEFT, touch.y)} p2={vec(canvasW - PAD_RIGHT, touch.y)} color="rgba(255,255,255,0.12)" strokeWidth={StyleSheet.hairlineWidth} />
            {/* Glow ring */}
            <Circle cx={touch.x} cy={touch.y} r={12}  color={lineColor + "18"} />
            <Circle cx={touch.x} cy={touch.y} r={7}   color={lineColor + "40"} />
            <Circle cx={touch.x} cy={touch.y} r={4.5} color={lineColor} />
            <Circle cx={touch.x} cy={touch.y} r={2}   color="#FFFFFF" />
          </>
        )}
      </Canvas>

      {/* Y-axis price labels */}
      {!touch && yLabels.map((yl, i) => (
        <Text key={i} style={[styles.yLabel, { top: yl.y - 8, right: 4 }]} numberOfLines={1}>
          {yl.label}
        </Text>
      ))}

      {/* Current price pill */}
      {!touch && (
        <View style={[styles.currentPricePill, { top: priceLabelY, right: 4, borderColor: lineColor + "80", backgroundColor: lineColor + "22" }]}>
          <Text style={[styles.currentPriceText, { color: lineColor }]}>
            {fmtPrice(prices[prices.length - 1]?.price)}
          </Text>
        </View>
      )}

      {/* Y-axis price at touch point */}
      {touch && (
        <View style={[styles.yTouchPill, {
          top: Math.max(drawT, Math.min(drawB - 16, touch.y - 9)),
          right: 4,
          backgroundColor: lineColor + "22",
          borderColor: lineColor + "55",
        }]}>
          <Text style={[styles.yTouchText, { color: lineColor }]}>
            {fmtPrice(touch.price)}
          </Text>
        </View>
      )}

      {/* X-axis time labels */}
      {xLabels.map((xl, i) => (
        <Text
          key={i}
          style={[styles.xLabel, {
            left:   i === xLabels.length - 1 ? undefined : Math.max(0, xl.x - 20),
            right:  i === xLabels.length - 1 ? PAD_RIGHT + 2 : undefined,
            bottom: 4,
          }]}
          numberOfLines={1}
        >
          {xl.label}
        </Text>
      ))}

      {/* Touch tooltip — positioned above the dot */}
      {touch && (
        <View
          style={[styles.tooltip, {
            left: tooltipLeft,
            top: tooltipTop,
            borderColor: lineColor + "40",
          }]}
          pointerEvents="none"
        >
          <Text style={[styles.tooltipPrice, { color: lineColor }]}>
            {fmtPrice(touch.price)}
          </Text>
          <View style={styles.tooltipDivider} />
          <View style={styles.tooltipRow}>
            {touch.ts ? (
              <Text style={styles.tooltipTime}>
                {fmtTooltipTime(touch.ts, range)}
              </Text>
            ) : null}
            <Text style={[styles.tooltipChange, {
              color: touch.changePct >= 0 ? "#4ADE80" : "#F87171",
            }]}>
              {touch.changePct >= 0 ? "+" : ""}{touch.changePct.toFixed(2)}%
            </Text>
          </View>
        </View>
      )}

      {/* Touch responder — rendered LAST so it sits on top and receives gestures */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleTouchMove(e.nativeEvent.locationX)}
        onResponderMove={(e)  => handleTouchMove(e.nativeEvent.locationX)}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: {
    position: "absolute",
    width: 52,
    textAlign: "right",
    color: "rgba(255,255,255,0.30)",
    fontSize: 10,
    fontFamily: F.medium,
  },
  currentPricePill: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 52,
    alignItems: "center",
  },
  currentPriceText: {
    fontSize: 10,
    fontFamily: F.headSemi,
  },
  yTouchPill: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 48,
    alignItems: "center",
  },
  yTouchText: {
    fontSize: 9,
    fontFamily: F.headSemi,
  },
  xLabel: {
    position: "absolute",
    color: "rgba(255,255,255,0.28)",
    fontSize: 9,
    fontFamily: F.medium,
    width: 42,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "rgba(8,12,9,0.96)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    alignItems: "center",
    // Shadow for premium feel
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  tooltipPrice: {
    fontSize: 15,
    fontFamily: F.headBold,
    letterSpacing: -0.3,
  },
  tooltipDivider: {
    width: "80%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 4,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tooltipTime: {
    fontSize: 10,
    fontFamily: F.medium,
    color: "rgba(255,255,255,0.40)",
  },
  tooltipChange: {
    fontSize: 11,
    fontFamily: F.headSemi,
  },
});
