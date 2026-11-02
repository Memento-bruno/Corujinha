import * as SecureStore from "expo-secure-store";

/**
 * Tokens ficam no Keychain (iOS) / Keystore (Android), nunca em AsyncStorage.
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: não vai para backup nem para outro aparelho.
 */
const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const KEY = "corujinha.session";

export interface StoredSession {
  token: string;
  userId: string;
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(KEY, opts);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

export async function saveSession(s: StoredSession) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s), opts);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(KEY, opts);
}
