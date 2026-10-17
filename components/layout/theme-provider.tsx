"use client";

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "droply:theme";
const CHANGE_EVENT = "droply:theme-change";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: Resolved;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Runs before the first paint (see the Next.js guide "Preventing flash before hydration"),
 * so the page never flashes the wrong theme. It is a constant string: no user data in it.
 */
export const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((p===null||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribePreference(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function subscribeSystem(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const systemSnapshot = (): Resolved => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // During server rendering and hydration these return null: the bootstrap script's class
  // on <html> is authoritative until the client values are known.
  const theme = React.useSyncExternalStore<ThemePreference | null>(subscribePreference, readPreference, () => null);
  const system = React.useSyncExternalStore<Resolved | null>(subscribeSystem, systemSnapshot, () => null);

  const resolvedTheme: Resolved = (theme === "system" || theme === null ? system : theme) ?? "light";
  const known = theme !== null && system !== null;

  React.useEffect(() => {
    if (!known) return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [known, resolvedTheme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered across visits.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = React.useMemo(
    () => ({ theme: theme ?? "system", resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
