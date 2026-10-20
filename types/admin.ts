// Mirrors app/schemas/admin.py in the backend.

export type AdminPeriod = "1" | "7" | "30" | "all";
export type CheckStatus = "ok" | "warning" | "error" | "disabled";
export type OverallStatus = "healthy" | "degraded" | "down";

/** Counts per value, e.g. { phone: 12, laptop: 7 }, largest first. */
export interface Breakdown {
  device_types: Record<string, number>;
  browsers: Record<string, number>;
  operating_systems: Record<string, number>;
  /** "browser" (a browser tab) or "installed" (the installed app). */
  clients: Record<string, number>;
}

export interface DayStats {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  users: number;
  devices: number;
  rooms: number;
}

export interface LiveStats {
  rooms: number;
  devices: number;
  devices_online: number;
  breakdown: Breakdown;
  truncated: boolean;
}

export interface AdminOverview {
  period_days: number | null;
  users: number;
  devices: number;
  rooms: number;
  breakdown: Breakdown;
  daily: DayStats[];
  live: LiveStats;
  generated_at: string;
}

export interface HealthCheck {
  name: string;
  label: string;
  status: CheckStatus;
  detail: string;
  latency_ms: number | null;
}

export interface AdminHealth {
  status: OverallStatus;
  checks: HealthCheck[];
  service: string;
  version: string;
  environment: string;
  instance_id: string;
  started_at: string;
  uptime_seconds: number;
  checked_at: string;
}
