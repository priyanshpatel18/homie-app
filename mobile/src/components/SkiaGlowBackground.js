/**
 * SkiaGlowBackground — full-screen atmospheric glow.
 * Colors tuned to match the Homie logo: light mint top → deeper seafoam fade.
 */

import { StyleSheet, Dimensions } from "react-native";
import {
  Canvas,
  Rect,
  Group,
  RadialGradient,
  LinearGradient,
  vec,
} from "@shopify/react-native-skia";

const { width: W, height: H } = Dimensions.get("window");

const CORE_X  = W * 0.53;
const CORE_Y  = H * -0.04;
const SEC_X   = W * 0.25;
const SEC_Y   = H *  0.06;
const TEAL_X  = W * 0.78;
const TEAL_Y  = H * -0.02;
const BLOOM_X = W * 0.48;
const BLOOM_Y = H *  0.14;
const FOG_AX  = W * 0.40;
const FOG_AY  = H *  0.30;
const FOG_BX  = W * 0.65;
const FOG_BY  = H *  0.10;
const WARM_X  = W * 0.50;
const WARM_Y  = H *  0.55;

export default function SkiaGlowBackground() {
  return (
    <Canvas style={StyleSheet.absoluteFill}>

      {/* ── 1. VOID BASE ── */}
      <Rect x={0} y={0} width={W} height={H} color="rgba(1,6,3,1)" />

      {/* ── 2. PRIMARY CORE — mint-white light from above ── */}
      <Rect x={0} y={0} width={W} height={H}>
        <RadialGradient
          c={vec(CORE_X, CORE_Y)}
          r={W * 0.85}
          colors={[
            "rgba(167,243,208,0.68)",   // #A7F3D0 — logo top highlight
            "rgba(134,239,172,0.42)",   // #86EFAC — logo mid-light
            "rgba(110,231,183,0.20)",   // #6EE7B7
            "rgba(52, 211,153,0.07)",   // #34D399
            "rgba(16, 185,129,0.02)",
            "rgba(16, 185,129,0)",
          ]}
        />
      </Rect>

      {/* ── 3. SECONDARY SOURCE (left-biased mint) ── */}
      <Group opacity={0.70}>
        <Rect x={0} y={0} width={W} height={H}>
          <RadialGradient
            c={vec(SEC_X, SEC_Y)}
            r={W * 0.65}
            colors={[
              "rgba(110,231,183,0.38)",
              "rgba(52, 211,153,0.16)",
              "rgba(5,  150,105,0.04)",
              "rgba(5,  150,105,0)",
            ]}
          />
        </Rect>
      </Group>

      {/* ── 4. TEAL EDGE (right side, cooler) ── */}
      <Group opacity={0.45}>
        <Rect x={0} y={0} width={W} height={H}>
          <RadialGradient
            c={vec(TEAL_X, TEAL_Y)}
            r={W * 0.50}
            colors={[
              "rgba(94, 234,212,0.28)",  // teal-300
              "rgba(20, 184,166,0.10)",
              "rgba(6,  182,212,0)",
            ]}
          />
        </Rect>
      </Group>

      {/* ── 5. MEDIUM BLOOM — wide body halo ── */}
      <Group opacity={0.60}>
        <Rect x={0} y={0} width={W} height={H}>
          <RadialGradient
            c={vec(BLOOM_X, BLOOM_Y)}
            r={W * 1.20}
            colors={[
              "rgba(134,239,172,0.14)",
              "rgba(110,231,183,0.07)",
              "rgba(52, 211,153,0.02)",
              "rgba(52, 211,153,0)",
            ]}
          />
        </Rect>
      </Group>

      {/* ── 6. FOG VOLUME A ── */}
      <Rect x={0} y={0} width={W} height={H}>
        <RadialGradient
          c={vec(FOG_AX, FOG_AY)}
          r={W * 1.80}
          colors={[
            "rgba(209,250,229,0.04)",  // lightest mint fog
            "rgba(134,239,172,0.02)",
            "rgba(74, 222,128,0.01)",
            "rgba(74, 222,128,0)",
          ]}
        />
      </Rect>

      {/* ── 7. FOG VOLUME B ── */}
      <Rect x={0} y={0} width={W} height={H}>
        <RadialGradient
          c={vec(FOG_BX, FOG_BY)}
          r={W * 1.45}
          colors={[
            "rgba(167,243,208,0.04)",
            "rgba(110,231,183,0.02)",
            "rgba(52, 211,153,0)",
          ]}
        />
      </Rect>

      {/* ── 8. WARM GHOST (mid-screen, very subtle) ── */}
      <Group opacity={0.30}>
        <Rect x={0} y={0} width={W} height={H}>
          <RadialGradient
            c={vec(WARM_X, WARM_Y)}
            r={W * 1.0}
            colors={[
              "rgba(187,247,208,0.06)",
              "rgba(134,239,172,0.02)",
              "rgba(134,239,172,0)",
            ]}
          />
        </Rect>
      </Group>

      {/* ── 9. DIAGONAL LIGHT BLEED ── */}
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(W * 0.70, H * 0.50)}
          colors={[
            "rgba(134,239,172,0.07)",
            "rgba(110,231,183,0.03)",
            "rgba(52, 211,153,0)",
            "rgba(20, 184,166,0.02)",
          ]}
        />
      </Rect>

      {/* ── 10. BOTTOM VIGNETTE — readability ── */}
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient
          start={vec(0, H * 0.10)}
          end={vec(0, H)}
          colors={[
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.22)",
            "rgba(0,0,0,0.62)",
            "rgba(0,0,0,0.84)",
          ]}
        />
      </Rect>

    </Canvas>
  );
}
