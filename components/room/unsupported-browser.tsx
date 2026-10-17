import { MonitorXIcon } from "lucide-react";

export function UnsupportedBrowser({ reason }: { reason: "webrtc" | "crypto" }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <MonitorXIcon aria-hidden className="size-7" />
      </span>
      <h1 className="text-2xl font-semibold">
        {reason === "webrtc" ? "Your browser does not support direct transfers." : "This page needs a secure connection."}
      </h1>
      <p className="text-muted-foreground">
        {reason === "webrtc"
          ? "Try Chrome, Edge, Firefox, or Safari with a supported version."
          : "Open this site over HTTPS to transfer files. File verification needs it."}
      </p>
    </div>
  );
}

/** Checks the browser APIs a transfer needs. Returns null when everything is available. */
export function missingCapability(): "webrtc" | "crypto" | null {
  if (typeof window === "undefined") return null;
  if (typeof RTCPeerConnection === "undefined") return "webrtc";
  if (!window.isSecureContext || typeof crypto === "undefined" || !crypto.subtle) return "crypto";
  return null;
}
