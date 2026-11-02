import { Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";
import { colors } from "@/components/ui";

function icon(name: SymbolViewProps["name"]) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={26} />;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Mês", tabBarIcon: icon({ ios: "house", android: "home", web: "home" }) }}
      />
      <Tabs.Screen
        name="faturas"
        options={{
          title: "Faturas",
          tabBarIcon: icon({ ios: "creditcard", android: "credit_card", web: "credit_card" }),
        }}
      />
      <Tabs.Screen
        name="contas"
        options={{
          title: "Contas fixas",
          tabBarIcon: icon({ ios: "repeat", android: "repeat", web: "repeat" }),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: "Ajustes",
          tabBarIcon: icon({ ios: "gearshape", android: "settings", web: "settings" }),
        }}
      />
    </Tabs>
  );
}
