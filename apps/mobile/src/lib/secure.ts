import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// No navegador (versão de teste) não há Keychain: guardamos só em memória.
const isWeb = Platform.OS === "web";
let webMemory: string | null = null;

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
  const raw = isWeb ? webMemory : await SecureStore.getItemAsync(KEY, opts);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

export async function saveSession(s: StoredSession) {
  if (isWeb) webMemory = JSON.stringify(s);
  else await SecureStore.setItemAsync(KEY, JSON.stringify(s), opts);
}

export async function clearSession() {
  if (isWeb) webMemory = null;
  else await SecureStore.deleteItemAsync(KEY, opts);
}
