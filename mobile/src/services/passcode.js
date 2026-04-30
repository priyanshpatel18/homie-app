import * as SecureStore from "expo-secure-store";

const KEY  = "homie_passcode";
const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED };

export async function savePasscode(code) {
  await SecureStore.setItemAsync(KEY, code, OPTS);
}

export async function verifyPasscode(code) {
  const stored = await SecureStore.getItemAsync(KEY, OPTS);
  return stored === code;
}

export async function hasPasscode() {
  const val = await SecureStore.getItemAsync(KEY, OPTS);
  return !!val;
}

export async function clearPasscode() {
  await SecureStore.deleteItemAsync(KEY, OPTS);
}
