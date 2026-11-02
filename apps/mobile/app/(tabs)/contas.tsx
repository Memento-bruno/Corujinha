import { parseBRL } from "@corujinha/core";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, Money, Screen, colors, text } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

export default function Contas() {
  const api = useApi();
  const { data, error, loading, reload } = useLoad(async () => {
    const [r, h] = await Promise.all([api.recurring(), api.household()]);
    return { items: r.items, people: h.people };
  }, [api]);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [shared, setShared] = useState(true);

  async function add() {
    const cents = parseBRL(amount);
    const day = Number(dueDay);
    const payer = paidBy ?? data?.people[0]?.id;
    if (!description || !cents || cents <= 0 || !payer || !(day >= 1 && day <= 31)) {
      notify("Confira os campos", "Descrição, valor, dia (1 a 31) e quem paga.");
      return;
    }
    await api.addRecurring({
      description,
      amount: cents,
      paidBy: payer,
      dueDay: day,
      active: true,
      allocation: shared ? { type: "shared" } : { type: "personal", ownerId: payer },
    });
    setDescription("");
    setAmount("");
    reload();
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <Text style={text.h1}>Contas fixas</Text>
        {error && <Text style={{ color: colors.negative }}>{error}</Text>}

        {data?.items.map((b) => (
          <Card key={b.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={text.h2}>{b.description}</Text>
              <Money cents={b.amount} />
            </View>
            <Text style={text.muted}>
              Dia {b.dueDay} · paga: {data.people.find((p) => p.id === b.paidBy)?.name} ·{" "}
              {b.allocation.type === "shared" ? "dividida" : "individual"}
            </Text>
            <Button
              title="Remover"
              variant="secondary"
              onPress={async () => {
                await api.deleteRecurring(b.id);
                reload();
              }}
            />
          </Card>
        ))}

        <Card>
          <Text style={text.h2}>Nova conta fixa</Text>
          <TextInput style={styles.input} placeholder="Ex.: Aluguel" value={description} onChangeText={setDescription} />
          <TextInput
            style={styles.input}
            placeholder="Valor (R$)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Dia do vencimento"
            keyboardType="number-pad"
            value={dueDay}
            onChangeText={setDueDay}
          />
          <Text style={text.muted}>Quem paga</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {data?.people.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                active={(paidBy ?? data.people[0]?.id) === p.id}
                onPress={() => setPaidBy(p.id)}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Dividir" active={shared} onPress={() => setShared(true)} />
            <Chip label="Não dividir" active={!shared} onPress={() => setShared(false)} />
          </View>
          <Button title="Adicionar" onPress={add} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16 },
});
