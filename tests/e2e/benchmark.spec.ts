import { expect, test } from "@playwright/test";

// Opt-in: E2E_BENCHMARK=1 (needs a build with NEXT_PUBLIC_ENABLE_BENCHMARK=true).
// Runs the /dev/benchmark loopback transfer in real Chrome and records throughput and
// the JS heap, to show a large transfer never holds the file in memory.
test.skip(!process.env.E2E_BENCHMARK, "set E2E_BENCHMARK=1 to run");

test("synthetic transfer keeps memory bounded", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60_000);
  await page.goto("/dev/benchmark");
  await page.getByLabel("File size (MiB)").fill(process.env.E2E_BENCHMARK_MIB ?? "1024");
  await page.getByRole("button", { name: "Start" }).click();

  let peakHeap = 0;
  const done = page.getByRole("status").filter({ hasText: /Done|Stopped/ });
  const deadline = Date.now() + 29 * 60_000;
  while (!(await done.isVisible()) && Date.now() < deadline) {
    const heap = await page.evaluate(
      () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    );
    peakHeap = Math.max(peakHeap, heap);
    await page.waitForTimeout(500);
  }
  await expect(done).toContainText("Done");
  const summary = await done.textContent();
  const peakMb = Math.round(peakHeap / 1e6);
  testInfo.annotations.push({ type: "result", description: `${summary}; peak JS heap ${peakMb} MB` });
  console.log(`[benchmark] ${summary}; peak JS heap ${peakMb} MB`);
  // The file must never be held in memory.
  expect(peakHeap).toBeLessThan(400e6);
});
