import type { UserId } from "@/lib/domain/types";

export const PERSON = {
  USER_A: { bg: "#4f52d6", fg: "#ffffff" },
  USER_B: { bg: "#5fd3ad", fg: "#064e3b" },
} satisfies Record<UserId, { bg: string; fg: string }>;
