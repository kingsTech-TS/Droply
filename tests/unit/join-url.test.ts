import { describe, expect, it } from "vitest";
import { joinUrlFor } from "@/lib/utils/join-url";

describe("joinUrlFor", () => {
  it("uses the page's own origin, not the backend's (possibly stale) PUBLIC_FRONTEND_URL", () => {
    // jsdom serves tests from http://localhost:3000 by default.
    expect(joinUrlFor("K7X9PQ", "http://stale.example/join/K7X9PQ")).toBe(`${window.location.origin}/join/K7X9PQ`);
  });
});
