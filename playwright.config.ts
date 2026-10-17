import { defineConfig, devices } from "@playwright/test";

// Needs the backend (uvicorn, memory mode) on :8000 and the frontend on :3000.
// Uses the locally installed Chrome so no browser download is required.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome-desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "chrome-phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
