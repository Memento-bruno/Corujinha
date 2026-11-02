import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { onNotify } from "@/lib/notify";
import { colors } from "./ui";

/** Aviso flutuante para a versão web. Some sozinho ou ao tocar. */
export function Toast() {
  const [msg, setMsg] = useState<{ title: string; message?: string } | null>(null);

  useEffect(() => onNotify(setMsg), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  return (
    <Pressable accessibilityRole="alert" onPress={() => setMsg(null)} style={styles.box}>
      <Text style={styles.title}>{msg.title}</Text>
      {msg.message && <Text style={styles.body}>{msg.message}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    backgroundColor: colors.text,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  title: { color: "#fff", fontWeight: "700", fontSize: 15 },
  body: { color: "#e9e6ef", fontSize: 14 },
});
