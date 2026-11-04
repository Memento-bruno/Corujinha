import { afterEach, describe, expect, it, vi } from "vitest";
import { isPluggyBlockedByMissingLogin, isPluggyConfigured } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("Open Finance exige login quando publicado", () => {
  it("bloqueia na Vercel sem login e libera com login", () => {
    vi.stubEnv("PLUGGY_CLIENT_ID", "id");
    vi.stubEnv("PLUGGY_CLIENT_SECRET", "secret");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(isPluggyConfigured()).toBe(false);
    expect(isPluggyBlockedByMissingLogin()).toBe(true);

    vi.stubEnv("GOOGLE_CLIENT_ID", "g");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gs");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ALLOWED_USER_EMAIL_1", "a@example.com");
    expect(isPluggyConfigured()).toBe(true);
    expect(isPluggyBlockedByMissingLogin()).toBe(false);
  });

  it("no PC (fora da Vercel) funciona sem login", () => {
    vi.stubEnv("PLUGGY_CLIENT_ID", "id");
    vi.stubEnv("PLUGGY_CLIENT_SECRET", "secret");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(isPluggyConfigured()).toBe(true);
  });
});
