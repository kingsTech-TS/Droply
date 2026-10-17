"use client";

import { useSyncExternalStore } from "react";
import type { LocalStore } from "@/lib/utils/local-store";

/** Subscribes to a LocalStore (fallback value during server rendering and hydration). */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}
