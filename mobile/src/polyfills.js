// Must be the very first import in the app (see index.js).
// Sets up global.crypto so that jose (used by @privy-io/expo) can work in React Native.

import { getRandomValues } from 'expo-crypto';

// 1. Ensure global.crypto exists
if (!global.crypto) {
  global.crypto = {};
}

// 2. getRandomValues — use expo-crypto's native implementation (available in Expo Go)
if (!global.crypto.getRandomValues) {
  global.crypto.getRandomValues = getRandomValues;
}

// 3. subtle — Hermes (RN 0.73+) ships SubtleCrypto natively on globalThis.crypto.
//    Wire it onto global.crypto so bare `crypto.subtle` references work.
if (!global.crypto.subtle && globalThis.crypto?.subtle) {
  global.crypto.subtle = globalThis.crypto.subtle;
}
