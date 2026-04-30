import React, { useRef } from "react";
import {
  View, Text, StyleSheet, PanResponder, Animated,
} from "react-native";
import { F } from "../theme/fonts";

const THUMB_SIZE = 50;
const PAD        = 4;
const TRACK_H    = 58;
const GREEN      = "#4ADE80";

export default function SlideToConfirm({ onConfirm, onCancel, label = "slide to confirm" }) {
  const trackW  = useRef(0);
  const tx      = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  function getMax() {
    return Math.max(1, trackW.current - THUMB_SIZE - PAD * 2);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !doneRef.current,
      onMoveShouldSetPanResponder:  () => !doneRef.current,
      onPanResponderMove: (_, { dx }) => {
        tx.setValue(Math.max(0, Math.min(getMax(), dx)));
      },
      onPanResponderRelease: (_, { dx }) => {
        if (doneRef.current) return;
        const max = getMax();
        const x   = Math.max(0, Math.min(max, dx));
        if (x / max >= 0.80) {
          doneRef.current = true;
          Animated.spring(tx, {
            toValue: max,
            useNativeDriver: false,
            tension: 120,
            friction: 8,
          }).start(() => onConfirm?.());
        } else {
          Animated.spring(tx, {
            toValue: 0,
            useNativeDriver: false,
            tension: 80,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  // Fill grows with thumb: fillW = tx + THUMB_SIZE + PAD*2
  const fillW = tx.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_SIZE + PAD * 2, THUMB_SIZE + PAD * 2 + 1],
  });

  const labelOpacity = tx.interpolate({
    inputRange: [0, 70],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const chevronOpacity = tx.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0.3],
    extrapolate: "clamp",
  });

  return (
    <View
      style={styles.track}
      onLayout={(e) => { trackW.current = e.nativeEvent.layout.width; }}
    >
      {/* Green fill — clips to track via overflow: hidden on parent */}
      <Animated.View style={[styles.fill, { width: fillW }]} />

      {/* Track label */}
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]}>
        {label}
      </Animated.Text>

      {/* Draggable thumb */}
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: tx }] }]}
        {...pan.panHandlers}
      >
        <Animated.Text style={[styles.chevrons, { opacity: chevronOpacity }]}>›</Animated.Text>
        <Text style={styles.chevrons}>›</Text>
        <Text style={styles.chevrons}>›</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginTop: 10,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(74,222,128,0.18)",
    borderRightWidth: 1,
    borderRightColor: "rgba(74,222,128,0.30)",
  },
  label: {
    position: "absolute",
    left: THUMB_SIZE + PAD * 2 + 12,
    right: 16,
    color: "rgba(255,255,255,0.38)",
    fontSize: 13,
    fontFamily: F.headSemi,
    letterSpacing: 0.8,
  },
  thumb: {
    position: "absolute",
    left: PAD,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: -6,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  chevrons: {
    color: "rgba(0,0,0,0.7)",
    fontSize: 20,
    fontFamily: F.headBold,
    lineHeight: 24,
  },
});
