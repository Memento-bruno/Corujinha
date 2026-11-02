import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, colors, text } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * Login provisório do esqueleto: usa o DEV_AUTH_TOKEN da API.
 * TODO(próximo PR): trocar por Supabase Auth (link mágico por e-mail + passkey),
 * enviando o JWT do Supabase no lugar do token de desenvolvimento.
 */
export default function Login() {
  const { signIn } = useSession();
  const [devToken, setDevToken] = useState("");
  const [userId, setUserId] = useState("");

  return (
    <View style={styles.box}>
      <Text style={styles.owl}>🦉</Text>
      <Text style={text.h1}>Corujinha</Text>
      <Text style={[text.muted, { textAlign: "center" }]}>
        As faturas do casal num só lugar. Acesso restrito a duas pessoas.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Token de desenvolvimento"
        secureTextEntry
        autoCapitalize="none"
        value={devToken}
        onChangeText={setDevToken}
      />
      <TextInput
        style={styles.input}
        placeholder="Seu ID de usuário"
        autoCapitalize="none"
        value={userId}
        onChangeText={setUserId}
      />
      <Button
        title="Entrar"
        disabled={!devToken || !userId}
        onPress={() => signIn({ token: `${devToken}:${userId}`, userId })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.bg },
  owl: { fontSize: 56, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    fontSize: 16,
  },
});
