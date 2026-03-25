export class MemoryCache<T> {
  private readonly store = new Map<string, T>();

  public get(key: string): T | undefined {
    return this.store.get(key);
  }

  public set(key: string, value: T): T {
    this.store.set(key, value);
    return value;
  }

  public delete(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}
