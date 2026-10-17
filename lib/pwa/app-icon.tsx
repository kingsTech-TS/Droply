import { ImageResponse } from "next/og";

// The brand mark (lucide "zap" on the primary color), rendered as a PNG for the web manifest
// and notifications. Maskable-safe: the bolt stays inside the central 80% of the square.
const ZAP =
  "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z";

export function appIcon(size: number): ImageResponse {
  const bolt = Math.round(size * 0.5);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#4b45e0" }}>
        <svg width={bolt} height={bolt} viewBox="0 0 24 24" fill="#f7f7ff" stroke="#f7f7ff" strokeWidth={1.5} strokeLinejoin="round">
          <path d={ZAP} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
