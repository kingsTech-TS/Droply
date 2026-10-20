import type { AdminHealth, AdminOverview, AdminPeriod } from "@/types/admin";
import { apiClient, type ApiClient } from "./client";

/** Anonymous usage counts for the admin dashboard. `token` is the server's ADMIN_TOKEN. */
export function getAdminOverview(token: string, period: AdminPeriod, client: ApiClient = apiClient): Promise<AdminOverview> {
  return client.request<AdminOverview>("GET", `/admin/overview?period=${period}`, { token });
}

/** Runs every health check on the server now. */
export function runAdminHealth(token: string, client: ApiClient = apiClient): Promise<AdminHealth> {
  return client.request<AdminHealth>("GET", "/admin/health", { token });
}
