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

export const env = {
  apiUrl: url(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000/api/v1", "NEXT_PUBLIC_API_URL"),
  wsUrl: url(process.env.NEXT_PUBLIC_WS_URL, "ws://localhost:8000/ws/v1", "NEXT_PUBLIC_WS_URL"),
  debug: flag(process.env.NEXT_PUBLIC_DEBUG),
  benchmarkEnabled: flag(process.env.NEXT_PUBLIC_ENABLE_BENCHMARK),
  // The backend refuses more than 20 unfinished transfers per device.
  maxActiveTransfers: Math.min(positiveInt(process.env.NEXT_PUBLIC_MAX_ACTIVE_TRANSFERS, 16), 20),
} as const;
