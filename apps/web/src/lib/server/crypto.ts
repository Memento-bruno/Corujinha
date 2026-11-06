import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scryptSync } from "node:crypto";

/**
 * Criptografia dos arquivos JSON antes de irem para o Google Drive.
 * AES-256-GCM (confidencialidade + integridade). O nome do arquivo entra como AAD:
 * um arquivo não pode ser trocado por outro.
 *
 * v2 (atual): o ENCRYPTION_SECRET passa pelo scrypt UMA vez por servidor (chave mestra) e cada
 * arquivo ganha sua própria chave com HKDF-SHA256 (salt aleatório por gravação + nome do arquivo).
 * Mesma segurança contra quem não tem o segredo, mas sem gastar ~85 ms de scrypt por arquivo lido
 * (a tela inicial lê uns 20 arquivos).
 * v1 (antigo): scrypt com salt aleatório por arquivo. Continua sendo lido normalmente.
 */
export interface EncryptedEnvelope {
  corujinha: "enc";
  v: 1 | 2;
  alg: "AES-256-GCM";
  kdf: "scrypt" | "scrypt+hkdf";
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
/** Salt fixo da chave mestra (v2). A aleatoriedade por arquivo vem do salt do HKDF. */
const MASTER_SALT = Buffer.from("corujinha:master-key:v2", "utf8");

const keyCache = new Map<string, Buffer>();

function secretId(secret: string): string {
  return createHash("sha256").update(secret).digest("base64");
}

function cached(cacheKey: string, make: () => Buffer): Buffer {
  const hit = keyCache.get(cacheKey);
  if (hit) return hit;
  const key = make();
  if (keyCache.size > 256) keyCache.clear();
  keyCache.set(cacheKey, key);
  return key;
}

/** v1: scrypt com o salt do próprio arquivo. */
function deriveKeyV1(secret: string, salt: Buffer): Buffer {
  return cached(`v1:${secretId(secret)}:${salt.toString("base64")}`, () => scryptSync(secret, salt, 32, SCRYPT));
}

function masterKey(secret: string): Buffer {
  return cached(`m:${secretId(secret)}`, () => scryptSync(secret, MASTER_SALT, 32, SCRYPT));
}

/** v2: chave do arquivo = HKDF(chave mestra, salt do arquivo, nome do arquivo). Rápido. */
function deriveKeyV2(secret: string, salt: Buffer, aad: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(secret), salt, Buffer.from(`corujinha:file:${aad}`, "utf8"), 32));
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
  const key = deriveKeyV2(secret, salt, aad);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const env: EncryptedEnvelope = {
    corujinha: "enc",
    v: 2,
    alg: "AES-256-GCM",
    kdf: "scrypt+hkdf",
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

/**
 * `requireEncrypted`: no Google Drive, um arquivo sem criptografia é recusado
 * (senão alguém com acesso à pasta poderia colocar dados falsos que o app aceitaria).
 */
export function decryptJson<T>(raw: string, secret: string | undefined, aad: string, requireEncrypted = false): T {
  const parsed: unknown = JSON.parse(raw);
  if (!isEncryptedEnvelope(parsed)) {
    if (requireEncrypted) throw new Error(`O arquivo ${aad} no Drive não está criptografado; por segurança ele não foi lido.`);
    return parsed as T; // arquivo legado/local sem criptografia
  }
  assertStrongSecret(secret);
  const salt = Buffer.from(parsed.salt, "base64");
  const key = parsed.v === 2 ? deriveKeyV2(secret, salt, aad) : deriveKeyV1(secret, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

/** Só para testes: grava no formato antigo (v1) para conferir que continua sendo lido. */
export function encryptJsonV1ForTests(value: unknown, secret: string, aad: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKeyV1(secret, salt), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({
    corujinha: "enc", v: 1, alg: "AES-256-GCM", kdf: "scrypt",
    salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64"),
  });
}
