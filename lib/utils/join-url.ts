/**
 * The link other devices open to join (encoded in the QR code). It is built from the
 * address this page is actually served from, so it is right on every deployment, preview
 * URL or LAN address, even if the backend's PUBLIC_FRONTEND_URL is out of date. The
 * backend's join_url is only used when there is no browser location (server rendering).
 */
export function joinUrlFor(roomCode: string, backendJoinUrl: string): string {
  if (typeof window === "undefined" || !window.location?.origin || window.location.origin === "null") {
    return backendJoinUrl;
  }
  return `${window.location.origin}/join/${encodeURIComponent(roomCode)}`;
}
