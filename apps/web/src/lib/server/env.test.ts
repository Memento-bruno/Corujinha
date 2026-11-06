import { afterEach, describe, expect, it, vi } from "vitest";
import { isPluggyBlockedByMissingLogin, isPluggyConfigured, isStorageBlocked, driveMissingVars } from "./env";
import { isDriveAuthError } from "./errors";

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

describe("Drive faltando na Vercel", () => {
  const login = () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "g");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gs");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ALLOWED_USER_EMAIL_1", "a@example.com");
  };
  it("trava em vez de gravar no disco temporário", () => {
    login();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "pasta");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
    vi.stubEnv("ENCRYPTION_SECRET", "s".repeat(44));
    expect(driveMissingVars()).toEqual(["GOOGLE_DRIVE_REFRESH_TOKEN"]);
    expect(isStorageBlocked()).toBe(true);
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "tok");
    expect(isStorageBlocked()).toBe(false);
  });
  it("no PC continua funcionando sem Drive", () => {
    login();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "");
    expect(isStorageBlocked()).toBe(false);
  });
});

describe("token do Drive vencido", () => {
  it("reconhece o erro do Google", () => {
    expect(isDriveAuthError({ message: "invalid_grant" })).toBe(true);
    expect(isDriveAuthError({ response: { data: { error: "invalid_grant" } }, message: "x" })).toBe(true);
    expect(isDriveAuthError(new Error("outra coisa"))).toBe(false);
  });
});
