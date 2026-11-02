import { formatBRL, parseBRL, type SplitRule } from "@corujinha/core";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, Screen, colors, text } from "@/components/ui";
import { useApi, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

export default function Ajustes() {
  const api = useApi();
  const { session, signOut } = useSession();
  const { data, reload } = useLoad(() => api.household(), [api]);
  const [income, setIncome] = useState("");

  const me = data?.people.find((p) => p.id === session?.userId);

  async function saveIncome() {
    const cents = parseBRL(income);
    if (!cents || cents <= 0) return Alert.alert("Valor inválido");
    await api.setIncome(cents);
    setIncome("");
    reload();
  }

  async function setRule(rule: SplitRule) {
    try {
      await api.setRule(rule);
      reload();
    } catch (e) {
      Alert.alert("Não deu para mudar a regra", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={text.h1}>Ajustes</Text>

        <Card>
          <Text style={text.h2}>Como dividir</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Chip label="Meio a meio" active={data?.rule.kind === "equal"} onPress={() => setRule({ kind: "equal" })} />
            <Chip
              label="Proporcional à renda"
              active={data?.rule.kind === "proportional_income"}
              onPress={() => setRule({ kind: "proportional_income" })}
            />
          </View>
          {data?.shares && (
            <Text style={text.muted}>
              {data.people
                .map((p) => `${p.name}: ${data.shares![p.id]?.toFixed(2).replace(".", ",")}%`)
                .join(" · ")}
            </Text>
          )}
        </Card>

        <Card>
          <Text style={text.h2}>Minha remuneração mensal</Text>
          <Text style={text.muted}>
            Atual: {me?.monthlyIncome ? formatBRL(me.monthlyIncome) : "não informada"}. Só é usada para calcular o
            percentual da divisão.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: 7.000,00"
            keyboardType="decimal-pad"
            value={income}
            onChangeText={setIncome}
          />
          <Button title="Salvar" onPress={saveIncome} />
        </Card>

        <Card>
          <Text style={text.h2}>Privacidade</Text>
          <Text style={text.body}>
            O Corujinha só lê faturas e transações de cartão de crédito. Não acessa saldo de conta, não faz Pix e
            não inicia pagamentos. Por padrão, o acesso ao banco é encerrado logo depois de baixar as faturas.
          </Text>
        </Card>

        <Button title="Sair" variant="secondary" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
});
