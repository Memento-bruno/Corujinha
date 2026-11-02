import { Text, View } from "react-native";
import type { BankConnectProps } from "./BankConnect";

/** No navegador o widget nativo da Pluggy não roda; a versão web usa o modo demonstração. */
export function BankConnect(_: BankConnectProps) {
  return (
    <View style={{ padding: 24 }}>
      <Text>A conexão com bancos reais só funciona no app instalado.</Text>
    </View>
  );
}
