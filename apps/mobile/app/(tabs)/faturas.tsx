import type { Allocation, CardTransaction } from "@corujinha/core";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Button, Card, Chip, Money, Screen, colors, text } from "@/components/ui";
import { previousMonth } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

export default function Faturas() {
  const api = useApi();
  const { session } = useSession();
  const month = previousMonth();
  const [local, setLocal] = useState<Record<string, Allocation>>({});
  const { data, error, loading, reload } = useLoad(async () => {
    const [b, h] = await Promise.all([api.bills(month), api.household()]);
    setLocal({});
    return { ...b, people: h.people };
  }, [api, month]);

  async function classify(txId: string, allocation: Allocation) {
    setLocal((l) => ({ ...l, [txId]: allocation })); // otimista
    try {
      await api.classify(txId, allocation);
    } catch {
      reload();
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <Text style={text.h1}>Faturas de {month}</Text>
        <Button title="Conectar / atualizar cartão" variant="secondary" onPress={() => router.push("/conectar")} />
        {error && <Text style={{ color: colors.negative }}>{error}</Text>}
        {data?.bills.length === 0 && (
          <Text style={text.muted}>Nenhuma fatura deste mês ainda. Conecte um cartão para começar.</Text>
        )}
        {data?.bills.map((bill) => {
          const card = data.cards.find((c) => c.id === bill.cardId);
          const owner = data.people.find((p) => p.id === card?.ownerId);
          return (
            <Card key={bill.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={text.h2}>{card?.displayName}</Text>
                  <Text style={text.muted}>
                    {card?.institution} · {owner?.name} · vence {bill.dueDate.slice(8, 10)}/{bill.dueDate.slice(5, 7)}
                  </Text>
                </View>
                <Money cents={bill.total} />
              </View>
              {bill.transactions.map((t) => (
                <TxRow
                  key={t.id}
                  tx={t}
                  allocation={local[t.id] ?? data.classification[t.id]}
                  ownerId={card?.ownerId ?? session!.userId}
                  onChange={(a) => classify(t.id, a)}
                />
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function TxRow({
  tx,
  allocation,
  ownerId,
  onChange,
}: {
  tx: CardTransaction;
  allocation?: Allocation;
  ownerId: string;
  onChange: (a: Allocation) => void;
}) {
  const shared = allocation?.type === "shared";
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>
          {tx.description}
          {tx.installment ? ` (${tx.installment.number}/${tx.installment.total})` : ""}
        </Text>
        <Money cents={tx.amount} style={tx.amount < 0 ? { color: colors.positive } : undefined} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Dividir" active={shared} onPress={() => onChange({ type: "shared" })} />
        <Chip label="Não dividir" active={!shared} onPress={() => onChange({ type: "personal", ownerId })} />
      </View>
    </View>
  );
}
