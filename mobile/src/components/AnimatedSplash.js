import React, { useEffect, useRef } from "react";
import { StyleSheet, Animated, Easing } from "react-native";
import HomieLogoMain from "./HomieLogoMain";

const BG = "#010603";

export default function AnimatedSplash({ onDone }) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const scale    = useRef(new Animated.Value(0.82)).current;
  const wrapOpac = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo fade+scale in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 70,
          friction: 9,
          useNativeDriver: true,
        }),
      ]),
      // 2. Hold
      Animated.delay(900),
      // 3. Fade out whole screen
      Animated.timing(wrapOpac, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onDone?.());
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: wrapOpac }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <HomieLogoMain size={96} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
