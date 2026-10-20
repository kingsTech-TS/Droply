// NEXT_PUBLIC_* values are inlined at build time, so each one must be read with a
// literal `process.env.NEXT_PUBLIC_...` expression.

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function flag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function url(value: string | undefined, devDefault: string, name: string): string {
  if (value) return stripTrailingSlash(value);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} must be set for production builds. Set it in your hosting provider's environment ` +
        `variables (e.g. Vercel → Project → Settings → Environment Variables) to your deployed ` +
        `backend's URL, then redeploy. See .env.example.`,
    );
  }
  return devDefault;
}

const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Turns a Google Drive share link ("…/file/d/<id>/view?usp=sharing", "…/open?id=<id>") into
 * its direct-download URL, so the button downloads the file instead of opening Drive.
 * `confirm=t` skips Drive's "can't scan large files for viruses" page. Other URLs are kept.
 */
export function directDownloadUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }
  if (parsed.hostname !== "drive.google.com" && parsed.hostname !== "docs.google.com") return value;
  const id = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? parsed.searchParams.get("id");
  if (!id || !DRIVE_ID.test(id)) return value;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

export const env = {
  apiUrl: url(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000/api/v1", "NEXT_PUBLIC_API_URL"),
  wsUrl: url(process.env.NEXT_PUBLIC_WS_URL, "ws://localhost:8000/ws/v1", "NEXT_PUBLIC_WS_URL"),
  debug: flag(process.env.NEXT_PUBLIC_DEBUG),
  benchmarkEnabled: flag(process.env.NEXT_PUBLIC_ENABLE_BENCHMARK),
  // The backend refuses more than 20 unfinished transfers per device.
  maxActiveTransfers: Math.min(positiveInt(process.env.NEXT_PUBLIC_MAX_ACTIVE_TRANSFERS, 16), 20),
  // The Android app (APK). It's too large for git and Vercel (100 MB per file), so production
  // links to wherever it is hosted; without that URL the download is hidden. In development it
  // is served from public/app/Droply.apk.
  androidApp: {
    url: process.env.NEXT_PUBLIC_ANDROID_APK_URL
      ? directDownloadUrl(process.env.NEXT_PUBLIC_ANDROID_APK_URL)
      : process.env.NODE_ENV === "production"
        ? null
        : "/app/Droply.apk",
    version: process.env.NEXT_PUBLIC_ANDROID_APP_VERSION || null,
    /** Shown next to the button, e.g. "189 MB". */
    size: process.env.NEXT_PUBLIC_ANDROID_APK_SIZE || null,
    sha256: process.env.NEXT_PUBLIC_ANDROID_APK_SHA256 || null,
  },
} as const;
