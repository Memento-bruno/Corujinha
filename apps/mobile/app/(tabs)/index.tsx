import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Card, Money, Screen, colors, text } from "@/components/ui";
import { monthLabel, previousMonth } from "@/lib/api";
import { DEMO } from "@/lib/demo";
import { useApi, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

export default function Mes() {
  const api = useApi();
  const { session } = useSession();
  const month = previousMonth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [s, h] = await Promise.all([api.settlement(month), api.household()]);
    return { s, names: Object.fromEntries(h.people.map((p) => [p.id, p.name])), shares: h.shares };
  }, [api, month]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <Text style={text.h1}>Fechamento de {monthLabel(month)}</Text>
        {data && (
          <Text style={text.muted}>
            Você está como {data.names[session!.userId]}
            {DEMO ? " · versão de teste com dados fictícios" : ""}
          </Text>
        )}
        {error && <Text style={{ color: colors.negative }}>{error}</Text>}
        {data && (
          <>
            <Card>
              <Text style={text.muted}>Total do mês (faturas + contas fixas)</Text>
              <Money cents={data.s.total} style={{ fontSize: 28 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={text.body}>Dividido</Text>
                <Money cents={data.s.sharedTotal} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={text.body}>Individual</Text>
                <Money cents={data.s.personalTotal} />
              </View>
            </Card>

            <Card>
              <Text style={text.h2}>Acerto</Text>
              {data.s.transfers.length === 0 ? (
                <Text style={text.body}>Tudo certo: ninguém deve nada este mês. 🎉</Text>
              ) : (
                data.s.transfers.map((t) => (
                  <Text key={`${t.from}-${t.to}`} style={text.body}>
                    {data.names[t.from]} transfere{" "}
                    <Money cents={t.amount} style={{ color: colors.primary }} /> para {data.names[t.to]}
                  </Text>
                ))
              )}
            </Card>

            {data.s.balances.map((b) => (
              <Card key={b.personId}>
                <Text style={text.h2}>
                  {data.names[b.personId]}
                  {data.shares ? ` · ${data.shares[b.personId]?.toFixed(2).replace(".", ",")}%` : ""}
                </Text>
                <Row label="Pagou" cents={b.paid} />
                <Row label="Parte justa" cents={b.owes} />
                <Row
                  label={b.balance >= 0 ? "A receber" : "A pagar"}
                  cents={Math.abs(b.balance)}
                  color={b.balance >= 0 ? colors.positive : colors.negative}
                />
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, cents, color }: { label: string; cents: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={text.body}>{label}</Text>
      <Money cents={cents} style={color ? { color } : undefined} />
    </View>
  );
}
