// Droply service worker. Its only job is the PWA Share Target: when the user shares files or
// text to Droply from another app, the browser POSTs them here. We keep them in IndexedDB on
// this device (never uploaded) and open the app, which picks them up (lib/pwa/shared-inbox.ts).
// No caching of pages or API responses: Droply needs the network to reach other devices anyway.

const DB = "droply-share";
const STORE = "inbox";
const KEY = "latest";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function store(value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f) => f instanceof File && f.size > 0);
    const text = ["title", "text", "url"]
      .map((name) => form.get(name))
      .filter((v) => typeof v === "string" && v.trim())
      .join("\n");
    await store({ files, text: text || null, at: Date.now() });
  } catch {
    // Fall through: the app opens without the shared items rather than showing an error page.
  }
  return Response.redirect("/?share=1", 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(receiveShare(event.request));
  }
});
