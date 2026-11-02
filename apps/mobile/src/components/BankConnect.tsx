import { PluggyConnect } from "react-native-pluggy-connect";

export interface BankConnectProps {
  connectToken: string;
  onSuccess: (itemId: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/**
 * Widget de conexão da Pluggy pedindo SOMENTE cartão de crédito:
 * nada de conta corrente, saldo, Pix ou iniciação de pagamento.
 */
export function BankConnect({ connectToken, onSuccess, onError, onClose }: BankConnectProps) {
  return (
    <PluggyConnect
      connectToken={connectToken}
      products={["CREDIT_CARDS", "TRANSACTIONS"]}
      connectorTypes={["PERSONAL_BANK"]}
      includeSandbox={__DEV__}
      language="pt"
      onSuccess={({ item }) => onSuccess(item.id)}
      onError={({ message }) => onError(message)}
      onClose={onClose}
    />
  );
}
