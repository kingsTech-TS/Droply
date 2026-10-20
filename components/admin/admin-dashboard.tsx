"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LockIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminOverview, runAdminHealth } from "@/lib/api/admin";
import { isApiError, userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import type { AdminHealth, AdminOverview, AdminPeriod, Breakdown } from "@/types/admin";
import { BarList, DailyChart } from "./charts";
import { HealthPanel } from "./health-panel";

// The admin token is kept for this tab only (sessionStorage), never in a URL or localStorage.
const TOKEN_KEY = "droply:admin-token";
const REFRESH_MS = 60_000;

const PERIODS: { id: AdminPeriod; label: string }[] = [
  { id: "1", label: "Today" },
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "all", label: "All time" },
];

const DEVICE_TYPES: Record<string, string> = { phone: "Phone", tablet: "Tablet", laptop: "Laptop", desktop: "Desktop", unknown: "Unknown" };
const CLIENTS: Record<string, string> = {
  app: "Mobile app",
  browser: "Website (browser tab)",
  installed: "Website (installed to home screen)",
};
const number = new Intl.NumberFormat();

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token lasts until the page reloads.
  }
}

function adminError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401) return "That admin token is wrong.";
    if (error.status === 404) return "The admin dashboard is off on this server. Set ADMIN_TOKEN on the backend to turn it on.";
    if (error.status === 429) return "Too many wrong tokens. Wait a few minutes and try again.";
  }
  return userMessage(error);
}

export function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // sessionStorage only exists in the browser; read it once after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(readToken());
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!token) return <AdminLogin onToken={(t) => (storeToken(t), setToken(t))} />;
  return (
    <Dashboard
      token={token}
      onSignOut={() => {
        storeToken(null);
        setToken(null);
      }}
    />
  );
}

function AdminLogin({ onToken }: { onToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const token = value.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await getAdminOverview(token, "1");
      onToken(token);
    } catch (e) {
      setError(adminError(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <LockIcon aria-hidden className="size-5 text-primary" />
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">Enter the admin token configured on the server.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-token">Admin token</Label>
        <Input
          id="admin-token"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "admin-error" : undefined}
        />
      </div>
      {error ? (
        <p id="admin-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !value.trim()}>
        {busy ? "Checking…" : "Open dashboard"}
      </Button>
    </form>
  );
}

function Dashboard({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [period, setPeriod] = useState<AdminPeriod>("7");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"period" | "live">("period");
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await getAdminOverview(token, period));
      setError(null);
    } catch (e) {
      if (isApiError(e) && e.status === 401) onSignOut();
      setError(adminError(e));
    } finally {
      setLoading(false);
    }
  }, [token, period, onSignOut]);

  const runHealth = useCallback(async () => {
    setHealthRunning(true);
    try {
      setHealth(await runAdminHealth(token));
      setHealthError(null);
    } catch (e) {
      setHealthError(isApiError(e) && e.code === "NETWORK_ERROR" ? "Can't reach the server: the API itself is down or unreachable." : adminError(e));
    } finally {
      setHealthRunning(false);
    }
  }, [token]);

  useEffect(() => {
    // Data fetching on mount and when the period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runHealth();
  }, [runHealth]);

  const breakdown: Breakdown | null = overview ? (scope === "live" ? overview.live.breakdown : overview.breakdown) : null;
  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Anonymous counts only: no names, IPs or files.{" "}
            {overview ? `Updated ${new Date(overview.generated_at).toLocaleTimeString()}.` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Period" className="inline-flex rounded-xl border bg-muted/50 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium sm:min-h-9",
                  period === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            <RefreshCwIcon aria-hidden className={cn(loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOutIcon aria-hidden />
            Sign out
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Users" value={overview.users} hint={`Distinct browsers and app installs, ${periodLabel}`} />
            <StatTile label="Device visits" value={overview.devices} hint={`Times a device entered a room, ${periodLabel}`} />
            <StatTile label="Rooms created" value={overview.rooms} hint={periodLabel} />
            <StatTile
              label="Online now"
              value={overview.live.devices_online}
              hint={`${number.format(overview.live.rooms)} open ${overview.live.rooms === 1 ? "room" : "rooms"}${overview.live.truncated ? " (partial)" : ""}`}
              live
            />
          </div>

          <section aria-labelledby="daily-title" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
            <h2 id="daily-title" className="text-lg font-semibold">
              Users per day
            </h2>
            <DailyChart days={overview.daily} />
          </section>

          <section aria-labelledby="devices-title" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="devices-title" className="text-lg font-semibold">
                Devices
              </h2>
              <div role="tablist" aria-label="Which devices" className="inline-flex rounded-xl border bg-muted/50 p-1">
                {(
                  [
                    ["period", `Entered rooms (${periodLabel})`],
                    ["live", "Online now"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={scope === id}
                    onClick={() => setScope(id)}
                    className={cn(
                      "min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium sm:min-h-9",
                      scope === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {breakdown ? (
              <div className="grid gap-3 md:grid-cols-2">
                <BreakdownCard title="Mobile app or website" data={breakdown.clients} format={(k) => CLIENTS[k] ?? k} />
                <BreakdownCard title="Device type" data={breakdown.device_types} format={(k) => DEVICE_TYPES[k] ?? k} />
                <BreakdownCard title="Browser" data={breakdown.browsers} />
                <BreakdownCard title="Operating system" data={breakdown.operating_systems} />
              </div>
            ) : null}
          </section>
        </>
      ) : loading ? (
        <p className="py-10 text-center text-muted-foreground">Loading…</p>
      ) : null}

      <HealthPanel health={health} running={healthRunning} error={healthError} onRun={() => void runHealth()} />
    </div>
  );
}

function StatTile({ label, value, hint, live = false }: { label: string; value: number; hint: string; live?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {live ? <span aria-hidden className="size-2 rounded-full bg-success motion-safe:animate-pulse" /> : null}
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{number.format(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function BreakdownCard({ title, data, format }: { title: string; data: Record<string, number>; format?: (key: string) => string }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
      <h3 className="font-medium">{title}</h3>
      <BarList data={data} label={title} format={format} />
    </div>
  );
}
