import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";

/** Tempo em segundo plano após o qual o app pede biometria de novo. */
const RELOCK_AFTER_MS = 60_000;

/**
 * Trava o app com biometria/senha do aparelho ao abrir e ao voltar do
 * segundo plano. Enquanto travado, nada das faturas é renderizado
 * (o que também esconde o conteúdo no seletor de apps).
 */
export function BiometricLock({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    setError(null);
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      setError("Configure biometria ou senha no aparelho para usar o Corujinha.");
      return;
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquear Corujinha",
      cancelLabel: "Cancelar",
    });
    if (r.success) setUnlocked(true);
    else setError("Não foi possível confirmar sua identidade.");
  }, []);

  useEffect(() => {
    unlock();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        backgroundedAt.current ??= Date.now();
        return;
      }
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since && Date.now() - since > RELOCK_AFTER_MS) {
        setUnlocked(false);
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (unlocked) return <>{children}</>;
  return (
    <View style={styles.box}>
      <Text style={styles.owl}>🦉</Text>
      <Text style={styles.title}>Corujinha está trancada</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Desbloquear" onPress={unlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  owl: { fontSize: 64 },
  title: { fontSize: 20, fontWeight: "600" },
  error: { color: "#b3261e", textAlign: "center" },
});
