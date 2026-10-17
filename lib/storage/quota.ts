export interface StorageEstimateResult {
  available: number | null;
  usage: number | null;
}

export async function estimateStorage(): Promise<StorageEstimateResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { available: null, usage: null };
    }
    const { quota, usage } = await navigator.storage.estimate();
    return {
      available: quota !== undefined && usage !== undefined ? Math.max(0, quota - usage) : null,
      usage: usage ?? null,
    };
  } catch {
    return { available: null, usage: null };
  }
}

/** Asks the browser not to evict our temporary transfer data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
