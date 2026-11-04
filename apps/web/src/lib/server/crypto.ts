import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Criptografia dos arquivos JSON antes de irem para o Google Drive.
 * AES-256-GCM (confidencialidade + integridade). A chave de 256 bits é derivada
 * do ENCRYPTION_SECRET com scrypt e um salt aleatório por arquivo.
 * O nome do arquivo entra como AAD: um arquivo não pode ser trocado por outro.
 */
export interface EncryptedEnvelope {
  corujinha: "enc";
  v: 1;
  alg: "AES-256-GCM";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const keyCache = new Map<string, Buffer>();

function deriveKey(secret: string, salt: Buffer): Buffer {
  const cacheKey = `${createHash("sha256").update(secret).digest("base64")}:${salt.toString("base64")}`;
  const hit = keyCache.get(cacheKey);
  if (hit) return hit;
  const key = scryptSync(secret, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  if (keyCache.size > 256) keyCache.clear();
  keyCache.set(cacheKey, key);
  return key;
}

export function assertStrongSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET precisa ter pelo menos 32 caracteres (gere com: openssl rand -base64 32).");
  }
}

export function encryptJson(value: unknown, secret: string, aad: string): string {
  assertStrongSecret(secret);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(secret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const env: EncryptedEnvelope = {
    corujinha: "enc",
    v: 1,
    alg: "AES-256-GCM",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return JSON.stringify(env);
}

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  return typeof v === "object" && v !== null && (v as EncryptedEnvelope).corujinha === "enc";
}

export function decryptJson<T>(raw: string, secret: string | undefined, aad: string): T {
  const parsed: unknown = JSON.parse(raw);
  if (!isEncryptedEnvelope(parsed)) return parsed as T; // arquivo legado/local sem criptografia
  assertStrongSecret(secret);
  const salt = Buffer.from(parsed.salt, "base64");
  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
