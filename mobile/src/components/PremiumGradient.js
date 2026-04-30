import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';

const { width, height } = Dimensions.get('window');

// ─── SkSL Fragment Shader ───
// Pure black base with very subtle warm color pools drifting organically.
// Inspired by modern dark streaming/fintech UIs — mostly black, but alive.
const _skSl = `
uniform float2 resolution;

float3 mod289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float2 mod289(float2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float3 permute(float3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(float2 v) {
  const float4 C = float4(0.211324865405187,
                          0.366025403784439,
                         -0.577350269189626,
                          0.024390243902439);
  float2 i  = floor(v + dot(v, C.yy));
  float2 x0 = v -   i + dot(i, C.xx);
  float2 i1;
  i1 = (x0.x > x0.y) ? float2(1.0, 0.0) : float2(0.0, 1.0);
  float4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  float3 p = permute(permute(i.y + float3(0.0, i1.y, 1.0))
                           + i.x + float3(0.0, i1.x, 1.0));
  float3 m = max(0.5 - float3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  float3 x = 2.0 * fract(p * C.www) - 1.0;
  float3 h = abs(x) - 0.5;
  float3 ox = floor(x + 0.5);
  float3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  float3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

half4 main(float2 xy) {
  float2 uv = xy / resolution;
  
  // ─── Pure black base ───
  half4 black     = half4(0.0, 0.0, 0.0, 1.0);
  half4 warmDark  = half4(0.06, 0.02, 0.0, 1.0);    // Very subtle warm brown
  half4 amberGlow = half4(0.12, 0.05, 0.01, 1.0);   // Faint amber accent
  half4 coolDark  = half4(0.01, 0.01, 0.04, 1.0);    // Hint of midnight blue

  // ─── Noise for organic feel ───
  float n1 = snoise(uv * 1.4);
  float n2 = snoise(uv * 2.2 + float2(5.0, -2.0));
  float n3 = snoise(uv * 1.8 - float2(3.0, 1.0));
  
  // ─── Radial warmth — top-right area gets a hint of amber ───
  float warmZone = smoothstep(1.2, 0.0, length(uv - float2(0.8, 0.15)) + n1 * 0.2);
  
  // ─── Bottom-left gets a cool hint ───
  float coolZone = smoothstep(1.3, 0.0, length(uv - float2(0.1, 0.9)) + n2 * 0.15);
  
  // ─── Center depth variation ───
  float centerWarm = smoothstep(1.0, 0.0, length(uv - float2(0.5, 0.5)) + n3 * 0.3);
  
  // ─── Composite: overwhelmingly black ───
  half4 col = black;
  col = mix(col, warmDark,  centerWarm * 0.25);
  col = mix(col, amberGlow, warmZone * 0.18);
  col = mix(col, coolDark,  coolZone * 0.3);
  
  // ─── Vignette — darken edges further ───
  float vig = smoothstep(0.0, 1.5, length(uv - float2(0.5, 0.5)));
  col = mix(col, black, vig * 0.5);
  
  // ─── Dither ───
  float dither = fract(sin(dot(xy, float2(12.9898, 78.233))) * 43758.5453);
  col += half4(dither * 0.008 - 0.004);
  
  return col;
}
`;

const source = Skia.RuntimeEffect.Make(_skSl);

export default function PremiumGradient() {
  if (!source) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader 
          source={source} 
          uniforms={{ resolution: [width, height] }} 
        />
      </Fill>
    </Canvas>
  );
}
