import { Alert, Platform } from "react-native";

type Listener = (msg: { title: string; message?: string } | null) => void;
const listeners = new Set<Listener>();

/** Para o aviso na tela (usado na versão web, onde Alert não existe). */
export function onNotify(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Alert nativo no celular; aviso na própria tela na versão web. */
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") listeners.forEach((l) => l({ title, message }));
  else Alert.alert(title, message);
}
