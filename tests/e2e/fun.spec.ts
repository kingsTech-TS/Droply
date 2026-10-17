import { expect, test, type Browser, type Page } from "@playwright/test";

// The idea.txt features that run between two real browsers: text drops and chat over the
// DataChannel, the speed test, pairing ("My devices") and personal room links.

async function roomCode(page: Page): Promise<string> {
  const label = await page.getByLabel(/^Room code /).first().getAttribute("aria-label");
  return (label ?? "").replace("Room code ", "").replace(/\s+/g, "");
}

/** A opens an empty room, B joins it as "Test Phone". */
async function twoDevicesInARoom(browser: Browser) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto("/");
  await a.getByRole("button", { name: "Create an empty room to receive" }).click();
  await expect(a).toHaveURL(/\/room\//);
  const code = await roomCode(a);
  await b.goto(`/join/${code}`);
  await b.getByLabel("Your device name").fill("Test Phone");
  await b.getByRole("button", { name: "Join room" }).click();
  await expect(b).toHaveURL(/\/room\//);
  await expect(a.getByText("Test Phone").first()).toBeVisible();
  const close = async () => {
    await ctxA.close();
    await ctxB.close();
  };
  return { a, b, close };
}

async function deviceMenu(page: Page, name: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `More options for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("send a text, chat and run a speed test between two browsers", async ({ browser }) => {
  const { a, b, close } = await twoDevicesInARoom(browser);

  // Text drop: A → B, peer-to-peer.
  await deviceMenu(a, "Test Phone", "Send text or link");
  const dialog = a.getByRole("dialog", { name: "Send text or a link" });
  await dialog.getByLabel("Text to send").fill("https://example.com/wifi?pw=hunter2");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(b.getByText("https://example.com/wifi?pw=hunter2")).toBeVisible({ timeout: 20_000 });

  // Chat: B → everyone. A sees the unread count, then the message.
  await b.getByRole("button", { name: /^Chat/ }).click();
  await b.getByRole("textbox", { name: "Message" }).fill("hello from the phone");
  await b.getByRole("button", { name: "Send message" }).click();
  await expect(a.getByRole("button", { name: "Chat, 1 unread" })).toBeVisible({ timeout: 20_000 });
  await a.getByRole("button", { name: "Chat, 1 unread" }).click();
  await expect(a.getByRole("dialog").getByText("hello from the phone")).toBeVisible();
  await a.keyboard.press("Escape");

  // Speed test: synthetic data, nothing saved.
  await deviceMenu(a, "Test Phone", "Test speed");
  const speed = a.getByRole("dialog", { name: "Speed test with Test Phone" });
  await speed.getByRole("radio").first().click();
  await speed.getByRole("button", { name: "Start test" }).click();
  await expect(speed.getByText("Average")).toBeVisible({ timeout: 45_000 });
  await expect(speed.getByRole("button", { name: "Test again" })).toBeVisible();
  await expect(b.getByText("Incoming files")).toHaveCount(0);

  await close();
});

test("pair two devices, then they meet again without a room code", async ({ browser }) => {
  const { a, b, close } = await twoDevicesInARoom(browser);

  await deviceMenu(a, "Test Phone", "Add to My devices");
  const ask = b.getByRole("alertdialog", { name: "Add to My devices?" });
  await expect(ask).toBeVisible({ timeout: 20_000 });
  await ask.getByRole("button", { name: "Pair" }).click();
  await expect(a.getByText("Paired with Test Phone")).toBeVisible({ timeout: 20_000 });

  // Later, from anywhere: "Connect my devices" on both puts them in the same room.
  await a.goto("/my-devices");
  await expect(a.getByText("Test Phone")).toBeVisible();
  await a.getByRole("button", { name: "Connect my devices" }).click();
  await expect(a).toHaveURL(/\/room\//);

  // Scheduled send: queue a file while the other device is away.
  await a.locator('input[type="file"]').first().setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("see you on the laptop") });
  await a.getByRole("switch", { name: /Send when my device connects/ }).click();
  await expect(a.getByText("Will send when your device connects")).toBeVisible();

  await b.goto("/my-devices");
  await b.getByRole("button", { name: "Connect my devices" }).click();
  await expect(b).toHaveURL(a.url());
  await expect(a.getByRole("article", { name: "Test Phone, Online" })).toContainText("paired", { timeout: 20_000 });
  // Paired devices accept automatically: no "Incoming files" prompt on B.
  await expect(b.getByText("notes.txt").first()).toBeVisible({ timeout: 20_000 });
  await expect(b.getByText("Transfer complete").first()).toBeVisible({ timeout: 30_000 });
  await expect(b.getByRole("alertdialog", { name: "Incoming files" })).toHaveCount(0);

  await close();
});

test("a personal room link opens the owner's room", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("/my-devices");
  await a.getByRole("button", { name: "Create my room link" }).click();
  const link = (await a.getByText(/\/r\/[A-Za-z0-9_-]{43}$/).textContent())!.trim();
  await a.getByRole("button", { name: "Open my room" }).click();
  await expect(a).toHaveURL(/\/room\//);

  await b.goto(new URL(link).pathname);
  await b.getByLabel("Your device name").fill("Friend Laptop");
  await b.getByRole("button", { name: "Join room" }).click();
  await expect(b).toHaveURL(a.url());
  await expect(a.getByText("Friend Laptop").first()).toBeVisible();

  // An invalid link is rejected before reaching the server.
  await b.goto("/r/not-a-real-key");
  await expect(b.getByText("This room link isn't valid.")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
