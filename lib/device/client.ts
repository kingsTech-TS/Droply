// What this device tells the server for the anonymous usage counts on the admin dashboard:
// whether Droply runs as the installed app or in a browser tab, and a random id that only
// lets the server count distinct users (it keeps a keyed hash in a counter, never the id).
import type { ClientKind, DeviceInfoIn } from "@/types/device";

const INSTALL_ID_KEY = "droply:install-id";
const INSTALL_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** "installed" when opened from the home screen / app launcher (PWA), else "browser". */
export function clientKind(): ClientKind {
  if (typeof window === "undefined") return "browser";
  const standalone = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  // iOS Safari home-screen apps.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone ? "installed" : "browser";
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 22 base64url characters (132 random bits). */
function newInstallId(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte & 63];
  return out;
}

/** Random per-browser id, created once. Null if storage is blocked (not counted then). */
export function installId(): string | null {
  try {
    const stored = localStorage.getItem(INSTALL_ID_KEY);
    if (stored && INSTALL_ID.test(stored)) return stored;
    const id = newInstallId();
    localStorage.setItem(INSTALL_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** Adds the app kind and install id to the device info sent on room create/join. */
export function withClientInfo(device: DeviceInfoIn): DeviceInfoIn {
  const id = installId();
  return { ...device, client: device.client ?? clientKind(), ...(id && !device.install_id ? { install_id: id } : {}) };
}
