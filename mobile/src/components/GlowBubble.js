/**
 * GlowBubble — AI response bubble with animated effects:
 *
 *   • Rotating gradient border — two bright spots at opposite corners
 *   • Vertical shimmer flow — premium card-sheen light band
 *
 *   Uses a custom SVG path with per-corner radii so the Skia border
 *   exactly matches the CSS bubble shape (borderBottomLeftRadius: 5).
 */

import React, { useState, useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import {
  Canvas,
  Path as SkiaPath,
  Rect,
  Group,
  Paint,
  SweepGradient,
  LinearGradient,
  vec,
  Skia,
} from "@shopify/react-native-skia";
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const GLOW_PAD   = 6;
const RADIUS     = 20;
const RADIUS_BL  = 5;    // bottom-left — matches homieBubble CSS

/**
 * Build an SVG path string for a rounded rect with individual corner radii.
 * Order: top-left, top-right, bottom-right, bottom-left.
 */
function bubbleSVG(x, y, w, h, tl, tr, br, bl) {
  return (
    `M ${x + tl} ${y}` +
    ` L ${x + w - tr} ${y}` +
    ` A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` +
    ` L ${x + w} ${y + h - br}` +
    ` A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` +
    ` L ${x + bl} ${y + h}` +
    ` A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` +
    ` L ${x} ${y + tl}` +
    ` A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` +
    ` Z`
  );
}

export default function GlowBubble({ children, style }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;

  // ── Animation drivers ─────────────────────────────────────────────────────
  const borderAngle = useSharedValue(0);
  const shimmerY    = useSharedValue(0);

  useEffect(() => {
    borderAngle.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1, false
    );
    shimmerY.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1, false
    );
  }, []);

  const canvasW = w + GLOW_PAD * 2;
  const canvasH = h + GLOW_PAD * 2;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // Border rotation
  const bStart = useDerivedValue(() => borderAngle.value);
  const bEnd   = useDerivedValue(() => borderAngle.value + 360);

  // Vertical shimmer transform
  const shimmerBandH = canvasH * 0.40;
  const shimmerTransform = useDerivedValue(() => [
    { translateY: shimmerY.value * (canvasH + shimmerBandH) - shimmerBandH },
  ]);

  // ── Bubble path — per-corner radii matching the CSS shape ─────────────────
  const bubblePath = useMemo(() => {
    if (w <= 0 || h <= 0) return null;
    return Skia.Path.MakeFromSVGString(
      bubbleSVG(GLOW_PAD, GLOW_PAD, w, h, RADIUS, RADIUS, RADIUS, RADIUS_BL)
    );
  }, [w, h]);

  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) {
          setSize({ w: width, h: height });
        }
      }}
    >
      {w > 0 && h > 0 && bubblePath && (
        <Canvas
          style={[
            StyleSheet.absoluteFill,
            {
              top:    -GLOW_PAD,
              left:   -GLOW_PAD,
              right:  -GLOW_PAD,
              bottom: -GLOW_PAD,
              width:  canvasW,
              height: canvasH,
            },
          ]}
        >
          {/* ── 1. Rotating border — bright spots at two corners ── */}
          <SkiaPath path={bubblePath}>
            <Paint style="stroke" strokeWidth={1.5}>
              <SweepGradient
                c={vec(cx, cy)}
                colors={[
                  "rgba(74,222,128,0.12)",
                  "rgba(74,222,128,0.85)",
                  "rgba(74,222,128,0.12)",
                  "rgba(74,222,128,0.12)",
                  "rgba(74,222,128,0.85)",
                  "rgba(74,222,128,0.12)",
                ]}
                positions={[0, 0.12, 0.25, 0.50, 0.62, 1]}
                start={bStart}
                end={bEnd}
              />
            </Paint>
          </SkiaPath>

          {/* ── 2. Vertical shimmer flow ── */}
          <Group clip={bubblePath}>
            <Group transform={shimmerTransform}>
              <Rect
                x={GLOW_PAD}
                y={0}
                width={w}
                height={shimmerBandH}
              >
                <Paint style="fill">
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(0, shimmerBandH)}
                    colors={[
                      "transparent",
                      "rgba(255,255,255,0.025)",
                      "rgba(74,222,128,0.05)",
                      "rgba(255,255,255,0.025)",
                      "transparent",
                    ]}
                  />
                </Paint>
              </Rect>
            </Group>
          </Group>
        </Canvas>
      )}

      {children}
    </View>
  );
}
