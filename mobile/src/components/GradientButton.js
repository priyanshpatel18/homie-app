import { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import {
  Canvas, RoundedRect, RadialGradient, vec,
} from "@shopify/react-native-skia";

export default function GradientButton({
  label, onPress, disabled, style, textStyle,
  paddingVertical = 17, borderRadius = 18,
  children,
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width: W, height: H } = size;

  // Radius covers center → corners so all 4 edges get the lighter tint
  const r = W > 0 ? Math.sqrt((W / 2) ** 2 + (H / 2) ** 2) : 1;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width, height });
      }}
      style={[{ borderRadius, overflow: "hidden", opacity: disabled ? 0.38 : 1 }, style]}
    >
      {/* Radial gradient background via Skia */}
      {W > 0 && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <RoundedRect x={0} y={0} width={W} height={H} r={borderRadius}>
            <RadialGradient
              c={vec(W / 2, H / 2)}
              r={r}
              colors={disabled
                ? ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]
                : ["#00F666", "#B9FFCE"]}
            />
          </RoundedRect>
        </Canvas>
      )}

      <View style={[s.inner, { paddingVertical }]}>
        {children ?? (
          <Text style={[s.label, disabled && s.labelDisabled, textStyle]}>
            {label}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  inner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  label: {
    color: "#000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelDisabled: {
    color: "rgba(255,255,255,0.30)",
  },
});
