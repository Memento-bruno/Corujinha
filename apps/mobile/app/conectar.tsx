import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { PluggyConnect } from "react-native-pluggy-connect";
import { text } from "@/components/ui";
import { useApi } from "@/lib/session";

/**
 * Abre o Pluggy Connect pedindo SOMENTE os produtos de cartão de crédito.
 * Nada de contas correntes, saldo, Pix ou iniciação de pagamento.
 * Depois de conectar, a API baixa as faturas e (no modo one_shot) revoga
 * o consentimento na mesma hora.
 */
export default function Conectar() {
  const api = useApi();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparando conexão segura…");

  useEffect(() => {
    api
      .connectToken()
      .then((r) => setToken(r.accessToken))
      .catch((e) => setStatus(`Erro: ${e.message}`));
  }, [api]);

  if (!token) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator />
        <Text style={text.muted}>{status}</Text>
      </View>
    );
  }

  return (
    <PluggyConnect
      connectToken={token}
      products={["CREDIT_CARDS", "TRANSACTIONS"]}
      connectorTypes={["PERSONAL_BANK"]}
      includeSandbox={__DEV__}
      language="pt"
      onSuccess={async ({ item }) => {
        try {
          const r = await api.sync(item.id);
          Alert.alert(
            "Faturas importadas",
            `${r.bills} fatura(s) de ${r.cards} cartão(ões).` +
              (r.consentRevoked ? "\nO acesso ao banco já foi encerrado." : ""),
          );
        } catch (e) {
          Alert.alert("Erro ao importar", e instanceof Error ? e.message : String(e));
        }
        router.back();
      }}
      onError={({ message }) => Alert.alert("Erro na conexão", message)}
      onClose={() => router.back()}
    />
  );
}
