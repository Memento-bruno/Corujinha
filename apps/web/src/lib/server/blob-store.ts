/** Armazenamento de arquivos com controle de concorrência otimista (ETag). */
export interface StoredBlob {
  content: string;
  etag: string;
}

export interface BlobStore {
  readonly kind: "drive" | "local";
  read(name: string): Promise<StoredBlob | null>;
  /**
   * Grava o arquivo somente se a versão atual for `expectedEtag`
   * (`null` = o arquivo ainda não pode existir). Caso contrário lança ConflictError.
   */
  write(name: string, content: string, expectedEtag: string | null): Promise<{ etag: string }>;
  list(prefix: string): Promise<string[]>;
  remove(name: string): Promise<void>;
}

export class ConflictError extends Error {
  constructor(
    public readonly file: string,
    public readonly currentEtag: string | null,
  ) {
    super(`O arquivo ${file} foi alterado por outra pessoa. Recarregue e tente de novo.`);
    this.name = "ConflictError";
  }
}

/** Fila simples por chave: serializa escritas no mesmo arquivo dentro do processo. */
export class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.chains.set(
      key,
      next.catch(() => undefined),
    );
    try {
      return await next;
    } finally {
      if (this.chains.get(key) === next) this.chains.delete(key);
    }
  }
}
