/**
 * SkiaSendButton — green glowing icon button with lucide Send icon
 */

import { TouchableOpacity, StyleSheet, View } from "react-native";
import { Send } from "lucide-react-native";
import {
  Canvas,
  RoundedRect,
  RadialGradient,
  vec,
} from "@shopify/react-native-skia";

const BTN_W = 46;
const BTN_H = 46;
const BTN_R = 14;

export default function SkiaSendButton({ onPress, disabled }) {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {disabled ? (
          <RoundedRect x={0} y={0} width={BTN_W} height={BTN_H} r={BTN_R}
            color="rgba(255,255,255,0.06)"
          />
        ) : (
          <>
            {/* Dark base */}
            <RoundedRect x={0} y={0} width={BTN_W} height={BTN_H} r={BTN_R}
              color="rgba(2,12,6,1)"
            />

            {/* Radial gradient fill — bright center, lighter edges */}
            <RoundedRect x={0} y={0} width={BTN_W} height={BTN_H} r={BTN_R}>
              <RadialGradient
                c={vec(BTN_W / 2, BTN_H / 2)}
                r={BTN_W * 0.72}
                colors={["#00F666", "#B9FFCE"]}
              />
            </RoundedRect>
          </>
        )}
      </Canvas>

      <View style={styles.iconWrapper}>
        <Send
          size={18}
          color={disabled ? "rgba(255,255,255,0.22)" : "#000"}
          strokeWidth={2}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: BTN_W,
    height: BTN_H,
    borderRadius: BTN_R,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
});
