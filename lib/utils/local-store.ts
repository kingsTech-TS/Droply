// A typed value persisted in localStorage that React can subscribe to. Reads and writes
// never throw (private mode, blocked storage): the value then lives only in memory.

export class LocalStore<T> {
  private cache: T | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly key: string,
    private readonly fallback: T,
    private readonly validate: (raw: unknown) => T | null,
  ) {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key !== this.key) return;
        this.cache = undefined;
        this.emit();
      });
    }
  }

  get = (): T => {
    if (this.cache !== undefined) return this.cache;
    let value = this.fallback;
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(this.key);
      if (raw !== null) value = this.validate(JSON.parse(raw)) ?? this.fallback;
    } catch {
      // keep the fallback
    }
    this.cache = value;
    return value;
  };

  /** Server rendering and hydration use the fallback. */
  getServer = (): T => this.fallback;

  set(value: T): void {
    this.cache = value;
    try {
      localStorage.setItem(this.key, JSON.stringify(value));
    } catch {
      // memory only
    }
    this.emit();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.get()));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
