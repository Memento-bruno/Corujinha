import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { BankConnect } from "@/components/BankConnect";
import { Button, Card, colors, text } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/session";

/**
 * Conecta um cartão. Depois de conectar, a API baixa as faturas e
 * (no modo one_shot) revoga o consentimento na mesma hora.
 */
export default function Conectar() {
  const api = useApi();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparando conexão segura…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO) return;
    api
      .connectToken()
      .then((r) => setToken(r.accessToken))
      .catch((e) => setStatus(`Erro: ${e.message}`));
  }, [api]);

  async function sync(itemId: string) {
    setBusy(true);
    try {
      const r = await api.sync(itemId);
      notify(
        "Faturas importadas",
        `${r.bills} fatura(s) de ${r.cards} cartão(ões).` +
          (r.consentRevoked ? "\nO acesso ao banco já foi encerrado." : ""),
      );
    } catch (e) {
      notify("Erro ao importar", e instanceof Error ? e.message : String(e));
    }
    router.back();
  }

  if (DEMO) return <DemoConsent busy={busy} onAuthorize={() => sync("demo-item")} />;

  if (!token) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator />
        <Text style={text.muted}>{status}</Text>
      </View>
    );
  }

  return (
    <BankConnect
      connectToken={token}
      onSuccess={sync}
      onError={(m) => notify("Erro na conexão", m)}
      onClose={() => router.back()}
    />
  );
}

/** Simula a tela de consentimento do Open Finance, mostrando o que é pedido. */
function DemoConsent({ busy, onAuthorize }: { busy: boolean; onAuthorize: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ backgroundColor: colors.primarySoft }}>
        <Text style={text.h2}>Simulação</Text>
        <Text style={text.body}>
          No app de verdade, aqui você escolhe o banco e é levado ao app dele para autorizar. Nesta versão de teste,
          um cartão fictício é adicionado.
        </Text>
      </Card>
      <Card>
        <Text style={text.h2}>O Corujinha vai pedir ao banco</Text>
        <Text style={text.body}>✅ Faturas do cartão de crédito</Text>
        <Text style={text.body}>✅ Transações de cada fatura</Text>
        <Text style={text.body}>✅ Limite do cartão</Text>
        <Text style={[text.h2, { marginTop: 8 }]}>E não vai pedir</Text>
        <Text style={text.body}>🚫 Saldo ou extrato de conta corrente</Text>
        <Text style={text.body}>🚫 Pix, TED, boletos ou qualquer pagamento</Text>
        <Text style={text.body}>🚫 Senha do banco</Text>
        <Text style={[text.muted, { marginTop: 8 }]}>
          Depois de baixar as faturas, o acesso é encerrado na hora.
        </Text>
      </Card>
      {busy ? <ActivityIndicator /> : <Button title="Autorizar (simulação)" onPress={onAuthorize} />}
    </ScrollView>
  );
}
