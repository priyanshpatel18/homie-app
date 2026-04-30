import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@homie_confirm_threshold";

// null = always show modal. Number = auto-execute if inputAmountUsd <= threshold.
export async function loadConfirmThreshold() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return null;
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export async function saveConfirmThreshold(value) {
  try {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(KEY);
    } else {
      await AsyncStorage.setItem(KEY, String(value));
    }
  } catch {}
}
