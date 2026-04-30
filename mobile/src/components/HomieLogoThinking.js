/**
 * HomieLogoThinking — thinkinglogo.svg with a proper diagonal shimmer sweep.
 *
 * The shimmer band travels WITH the animated rect (objectBoundingBox gradient)
 * so the bright highlight cross-sweeps the logo from left to right in a loop.
 * Clip path confines the shimmer to the logo shape only.
 * Animation runs on the Reanimated native thread for smooth 60fps.
 */

import React, { useEffect } from "react";
import Svg, {
  Path, Defs, LinearGradient, Stop, ClipPath, Rect, G,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BODY_PATH =
  "M237.555 4.49544C105.343 -22.0301 -8.44485 219.996 1.05514 320.496C1.05514 484.496 196.055 525.995 242.555 525.995C271.259 527.874 316.055 525.995 316.055 525.995C316.055 525.995 512.055 509.996 553.555 355.496C587.555 253.496 511.555 -12.5044 377.555 0.995566C360.555 6.49567 332.555 33.9956 345.055 83.4956C357.055 111.496 359.555 126.496 371.555 150.496C339.711 143.147 323.047 142.722 298.555 157.996C311.347 139.347 311.297 132.354 301.555 124.996C283.762 118.713 265.054 125.669 216.055 156.996L237.555 126.981L254.555 95.4955C274.155 50.6955 254.555 9.99554 237.555 4.49544ZM107.555 291.996C118.327 239.177 134.055 221.496 167.555 210.996C197.055 210.996 227.055 243.496 227.055 296.996C227.055 338.996 195.055 394.496 161.555 383.996C132.055 383.996 103.055 350.496 107.555 291.996ZM435.555 291.996C435.555 231.496 397.555 210.996 375.555 210.996C353.555 210.996 316.055 243.496 316.055 296.996C316.055 338.996 334.055 387.996 381.555 383.996C411.055 383.996 435.555 348.496 435.555 291.996Z";

const EYE_L =
  "M107.555 291.996C118.327 239.177 134.055 221.496 167.555 210.996C197.055 210.996 227.055 243.496 227.055 296.996C227.055 338.996 195.055 394.496 161.555 383.996C132.055 383.996 103.055 350.496 107.555 291.996Z";

const EYE_R =
  "M435.555 291.996C435.555 231.496 397.555 210.996 375.555 210.996C353.555 210.996 316.055 243.496 316.055 296.996C316.055 338.996 334.055 387.996 381.555 383.996C411.055 383.996 435.555 348.496 435.555 291.996Z";

const STROKE_PATH =
  "M254.555 95.4955C274.155 50.6955 254.555 9.99554 237.555 4.49544C105.343 -22.0301 -8.44485 219.996 1.05514 320.496C1.05514 484.496 196.055 525.995 242.555 525.995C271.259 527.874 316.055 525.995 316.055 525.995C316.055 525.995 512.055 509.996 553.555 355.496C587.555 253.496 511.555 -12.5044 377.555 0.995566C360.555 6.49567 332.555 33.9956 345.055 83.4956C357.055 111.496 359.555 126.496 371.555 150.496C339.711 143.147 323.047 142.722 298.555 157.996C311.347 139.347 311.297 132.354 301.555 124.996C283.762 118.713 265.054 125.669 216.055 156.996M254.555 95.4955C240.95 123.486 232.296 136.328 216.055 156.996M254.555 95.4955L237.555 126.981L216.055 156.996M167.555 210.996C134.055 221.496 118.327 239.177 107.555 291.996C103.055 350.496 132.055 383.996 161.555 383.996C195.055 394.496 227.055 338.996 227.055 296.996C227.055 243.496 197.055 210.996 167.555 210.996ZM375.555 210.996C397.555 210.996 435.555 231.496 435.555 291.996C435.555 348.496 411.055 383.996 381.555 383.996C334.055 387.996 316.055 338.996 316.055 296.996C316.055 243.496 353.555 210.996 375.555 210.996Z";

const ASPECT = 528 / 563;

// Sweep rect starts fully off the left edge and ends fully off the right.
// In viewBox units (563 wide). Rect width = 220, so:
//   start: x = -(220 + margin) = -350 (well off left)
//   end:   x =  563 + 130      =  693 (well off right)
const X_FROM = -350;
const X_TO   =  693;

export default function HomieLogoThinking({ size = 40 }) {
  const progress = useSharedValue(0);
  const w = size;
  const h = size * ASPECT;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,   // infinite repeats
      false // don't reverse — always left → right
    );
    return () => cancelAnimation(progress);
  }, []);

  // Drives the rect's x attribute on the native thread
  const animatedProps = useAnimatedProps(() => ({
    x: X_FROM + progress.value * (X_TO - X_FROM),
  }));

  return (
    <Svg width={w} height={h} viewBox="0 0 563 528" fill="none">
      <Defs>
        {/* Base: white top → dark grey bottom */}
        <LinearGradient
          id="thinkBaseGrad"
          x1="281.07" y1="0.5"
          x2="281.07" y2="526.831"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="white" />
          <Stop offset="1" stopColor="#3D3C3C" />
        </LinearGradient>

        {/*
          Shimmer band — gradientUnits="objectBoundingBox" is the key fix.
          This makes the gradient span the RECT itself, not the canvas.
          So the bright center (offset 0.5) travels WITH the rect → proper sweep.
        */}
        <LinearGradient
          id="thinkShimmerGrad"
          x1="0" y1="0"
          x2="1" y2="0"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0"    stopColor="white" stopOpacity="0" />
          <Stop offset="0.30" stopColor="white" stopOpacity="0" />
          <Stop offset="0.50" stopColor="white" stopOpacity="0.78" />
          <Stop offset="0.70" stopColor="white" stopOpacity="0" />
          <Stop offset="1"    stopColor="white" stopOpacity="0" />
        </LinearGradient>

        {/* Clip shimmer to the logo body outline only */}
        <ClipPath id="thinkLogoClip">
          <Path fillRule="evenodd" clipRule="evenodd" d={BODY_PATH} />
        </ClipPath>
      </Defs>

      {/* Logo body — white-to-grey base */}
      <Path fillRule="evenodd" clipRule="evenodd" d={BODY_PATH} fill="url(#thinkBaseGrad)" />

      {/* Eyes */}
      <Path d={EYE_L} fill="black" />
      <Path d={EYE_R} fill="black" />

      {/* White stroke outline */}
      <Path d={STROKE_PATH} stroke="white" strokeWidth="1" fill="none" />

      {/*
        Diagonal shimmer sweep:
        - Outer G: clips the shimmer to the logo shape
        - Inner G: rotates -22° around the logo center so the sweep is diagonal
        - AnimatedRect: sweeps x from off-left → off-right, carrying the bright band with it
      */}
      <G clipPath="url(#thinkLogoClip)">
        <G transform="rotate(-22, 281, 264)">
          <AnimatedRect
            animatedProps={animatedProps}
            y={-400}
            width={220}
            height={1400}
            fill="url(#thinkShimmerGrad)"
          />
        </G>
      </G>
    </Svg>
  );
}
