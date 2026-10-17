import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Without these, Chrome would open native save/folder dialogs; the app falls back to normal
// downloads, which Playwright can capture.
async function withoutFilePickers(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showDirectoryPicker;
  });
}

async function roomCode(page: Page): Promise<string> {
  const label = await page.getByLabel(/^Room code /).first().getAttribute("aria-label");
  return (label ?? "").replace("Room code ", "").replace(/\s+/g, "");
}

test("create a room, join from another device, send a file over WebRTC and verify it", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });
  await withoutFilePickers(sender);
  await withoutFilePickers(receiver);
  const a = await sender.newPage();
  const b = await receiver.newPage();

  // A: pick a file on the landing page → a room is created and opened.
  const bytes = randomBytes(9 * 1024 * 1024 + 123);
  const expectedHash = createHash("sha256").update(bytes).digest("hex");
  await a.goto("/");
  await a.locator('input[type="file"]').first().setInputFiles({ name: "campus-event.mp4", mimeType: "video/mp4", buffer: bytes });
  await expect(a).toHaveURL(/\/room\//);
  await expect(a.getByText("Your room is ready")).toBeVisible();
  await expect(a.getByText("Files ready to send")).toBeVisible();
  const code = await roomCode(a);
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(a.getByRole("img", { name: "QR code to join this room" })).toBeVisible();

  // B: open the join link (what the QR code encodes), name the device, join.
  await b.goto(`/join/${code}`);
  await b.getByLabel("Your device name").fill("Test Phone");
  await b.getByRole("button", { name: "Join room" }).click();
  await expect(b).toHaveURL(/\/room\//);

  // A sees B and B is selected automatically (the only other device).
  await expect(a.getByText("Test Phone").first()).toBeVisible();
  await expect(a.getByRole("checkbox", { name: "Test Phone" })).toBeChecked();
  await a.getByRole("button", { name: "Send file", exact: true }).click();

  // B approves explicitly.
  const incoming = b.getByRole("alertdialog", { name: "Incoming files" });
  await expect(incoming).toBeVisible();
  await expect(incoming).toContainText("campus-event.mp4");
  await incoming.getByRole("button", { name: "Accept" }).click();

  // Data flows peer-to-peer and is verified before it counts as complete.
  await expect(b.getByText("File verified")).toBeVisible({ timeout: 45_000 });
  await expect(b.getByText("Transfer complete")).toBeVisible();
  await expect(a.getByText("Transfer complete")).toBeVisible({ timeout: 15_000 });

  // Both browsers report the path from WebRTC stats (loopback = host candidates).
  await expect(a.getByText("Direct connection")).toBeVisible();

  const downloadPromise = b.waitForEvent("download");
  await b.getByRole("button", { name: "Open / Save" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("campus-event.mp4");
  const saved = await readFile((await download.path())!);
  expect(createHash("sha256").update(saved).digest("hex")).toBe(expectedHash);

  await sender.close();
  await receiver.close();
});

test("declining a transfer is reported to the sender", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext();
  const a = await sender.newPage();
  const b = await receiver.newPage();

  await a.goto("/");
  await a.getByRole("button", { name: /create an empty room/i }).click();
  await expect(a).toHaveURL(/\/room\//);
  const code = await roomCode(a);
  await b.goto(`/join/${code}`);
  await b.getByRole("button", { name: "Join room" }).click();
  await expect(b).toHaveURL(/\/room\//);

  await expect(a.getByRole("checkbox").first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  await a.locator('input[type="file"]').first().setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await a.getByRole("button", { name: "Send file", exact: true }).click();
  const incoming = b.getByRole("alertdialog", { name: "Incoming files" });
  await incoming.getByRole("button", { name: "Decline" }).click();
  await expect(a.getByText("Declined", { exact: true })).toBeVisible({ timeout: 15_000 });

  await sender.close();
  await receiver.close();
});

test("an invalid room code shows a clear error", async ({ page }) => {
  await page.goto("/join/ZZZZZZ");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "room code" })).toContainText("That room code didn't work");
  await expect(page.getByRole("link", { name: "Create new room" })).toBeVisible();
});

test("no horizontal scrolling on the main pages", async ({ page }) => {
  for (const path of ["/", "/about", "/join/K7X9PQ", "/history", "/stats", "/privacy", "/speed-test", "/my-devices", "/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
