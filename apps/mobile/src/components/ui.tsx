import { formatBRL } from "@corujinha/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export const colors = {
  primary: "#5B3E96",
  primarySoft: "#EEE8F7",
  text: "#1C1B1F",
  muted: "#6B6873",
  border: "#E2DFE8",
  positive: "#1E7A46",
  negative: "#B3261E",
  bg: "#FAF9FC",
};

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Money({ cents, style }: { cents: number; style?: object }) {
  return <Text style={[styles.money, style]}>{formatBRL(cents)}</Text>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? "#fff" : colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={{ color: active ? "#fff" : colors.primary, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export const text = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: "700", color: colors.text },
  h2: { fontSize: 17, fontWeight: "600", color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  money: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.text },
  button: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonText: { fontSize: 16, fontWeight: "600" },
  chip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.primarySoft,
  },
  chipActive: { backgroundColor: colors.primary },
});
