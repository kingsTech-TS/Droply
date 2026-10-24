"use client";

import { useEffect, useSyncExternalStore } from "react";
import { droplyFolder, refreshDroplyFolder } from "@/lib/storage/droply-folder";

/** Where received files are saved, kept up to date (checks the browser's permission on mount). */
export function useDroplyFolder() {
  useEffect(() => {
    void refreshDroplyFolder();
  }, []);
  return useSyncExternalStore(droplyFolder.subscribe, droplyFolder.getSnapshot, droplyFolder.getSnapshot);
}
