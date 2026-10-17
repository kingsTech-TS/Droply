import { deflateSync } from "node:zlib";
import { expect, test, type Browser, type Page } from "@playwright/test";

/** A real (decodable) PNG of the given size, solid color, so it stays tiny on disk. */
function solidPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([240, 120, 60], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

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
  return { a, b, close, code };
}

async function deviceMenu(page: Page, name: string, item: string): Promise<void> {
  await page.getByRole("button", { name: `More options for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("send a text, chat and run a speed test between two browsers", async ({ browser }) => {
  // The quick test moves 32 MB; headless Chrome's loopback is slow (~1-2 MB/s) when other
  // tests run in parallel.
  test.setTimeout(180_000);
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
  await expect(speed.getByText("Average")).toBeVisible({ timeout: 120_000 });
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

test("the host can remove a device; guests can't", async ({ browser }) => {
  const { a, b, close } = await twoDevicesInARoom(browser);

  // B (a guest) has no remove option for the host.
  const hostName = (await a.getByRole("article", { name: /\(this device\)/ }).locator("p").first().getAttribute("title"))!;
  await b.getByRole("button", { name: `More options for ${hostName}` }).click();
  await expect(b.getByRole("menuitem", { name: "Remove from room" })).toHaveCount(0);
  await b.keyboard.press("Escape");

  // A (the host) removes B after confirming.
  await deviceMenu(a, "Test Phone", "Remove from room");
  const confirm = a.getByRole("alertdialog", { name: "Remove Test Phone?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(a.getByRole("article", { name: /^Test Phone/ })).toHaveCount(0);
  await expect(b.getByText("You were removed from this room.")).toBeVisible({ timeout: 20_000 });

  // B's old session is gone: reloading the room doesn't put it back in.
  await b.reload();
  await expect(b.getByText("You're not in this room")).toBeVisible();
  await expect(a.getByRole("article", { name: /^Test Phone/ })).toHaveCount(0);

  await close();
});

test("the theme picked when creating a room themes the room for everyone", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const primary = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());

  await a.goto("/");
  const classic = await primary(a);
  await a.getByRole("radio", { name: "Birthday" }).click();
  // The home page previews the theme.
  await expect(a.locator("html")).toHaveAttribute("data-room-theme", "birthday");
  expect(await primary(a)).not.toBe(classic);

  await a.getByRole("button", { name: "Create an empty room to receive" }).click();
  await expect(a).toHaveURL(/\/room\//);
  await expect(a.getByText("Birthday room")).toBeVisible();
  await expect(a.locator("html")).toHaveAttribute("data-room-theme", "birthday");

  // A guest gets the same theme from the server.
  await b.goto(`/join/${await roomCode(a)}`);
  await b.getByLabel("Your device name").fill("Test Phone");
  await b.getByRole("button", { name: "Join room" }).click();
  await expect(b.getByText("Birthday room")).toBeVisible();
  await expect(b.locator("html")).toHaveAttribute("data-room-theme", "birthday");

  // Leaving the room drops the theme on pages that aren't themed.
  await b.goto("/about");
  await expect(b.locator("html")).not.toHaveAttribute("data-room-theme", /.*/);

  await ctxA.close();
  await ctxB.close();
});

test("leaving keeps the room under Your active rooms; the creator comes back as host", async ({ browser }) => {
  const { a, b, close, code } = await twoDevicesInARoom(browser);
  const shown = `${code.slice(0, 3)} ${code.slice(3)}`;

  // The host leaves without closing the room.
  await a.getByRole("button", { name: "Leave room" }).click();
  await a.getByRole("alertdialog").getByRole("button", { name: "Leave", exact: true }).click();
  await expect(a).toHaveURL(/\/$/);
  const mine = a.getByRole("region", { name: "Your active rooms" });
  await expect(mine.getByText(shown)).toBeVisible({ timeout: 15_000 });
  await expect(mine).toContainText("You created it");

  // The guest becomes host meanwhile; the creator rejoins and is host again.
  await mine.getByRole("button", { name: `Rejoin room ${shown}` }).click();
  await expect(a).toHaveURL(/\/room\//);
  await expect(a.getByRole("article", { name: /\(this device\)/ })).toContainText("host");
  await expect(b.getByRole("article", { name: /\(this device\)/ })).not.toContainText("host", { timeout: 15_000 });

  // A guest who leaves on their own also keeps the room.
  await b.getByRole("button", { name: "Leave room" }).click();
  await expect(b).toHaveURL(/\/$/);
  const theirs = b.getByRole("region", { name: "Your active rooms" });
  await expect(theirs.getByText(shown)).toBeVisible({ timeout: 15_000 });
  await expect(theirs).toContainText("You joined");

  // ...but not after being removed by the host.
  await theirs.getByRole("button", { name: `Rejoin room ${shown}` }).click();
  await expect(b).toHaveURL(/\/room\//);
  await deviceMenu(a, "Test Phone", "Remove from room");
  await a.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(b.getByText("You were removed from this room.")).toBeVisible({ timeout: 20_000 });
  await b.goto("/");
  await expect(b.getByRole("region", { name: "Your active rooms" })).toHaveCount(0);

  await close();
});

test("previews stay small: thumbnails, not full-size photos, and no video players on phones", async ({ browser }, testInfo) => {
  const { a, close } = await twoDevicesInARoom(browser);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(4096, 7)]);
  await a.locator('input[type="file"]').first().setInputFiles([
    { name: "big-photo.png", mimeType: "image/png", buffer: solidPng(4000, 3000) },
    { name: "clip.mp4", mimeType: "video/mp4", buffer: mp4 },
  ]);
  await a.getByRole("button", { name: /^Send 2 files$/ }).click();

  // The photo's preview is a scaled-down copy (≤ 192 px), not the 12-megapixel original.
  const thumb = a.getByRole("button", { name: "Preview big-photo.png" }).locator("img");
  await expect(thumb).toBeVisible({ timeout: 20_000 });
  const width = await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(192);

  // Phones get no <video> thumbnails (each holds a hardware decoder); desktops still do.
  await expect(a.getByRole("button", { name: "Preview clip.mp4" })).toBeVisible();
  const videos = await a.locator("video").count();
  if (testInfo.project.name === "chrome-phone") expect(videos).toBe(0);
  else expect(videos).toBeGreaterThan(0);

  await close();
});
