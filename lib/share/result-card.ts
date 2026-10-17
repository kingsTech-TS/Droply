// Shareable image cards ("I just sent 4.2 GB in 51 s with Droply ⚡"), drawn on a canvas.
// Only numbers and the product name: no file names, so nothing private is shared by default.
import { brand } from "@/config/brand";

export interface CardContent {
  headline: string;
  detail: string;
  footer?: string;
}

export async function renderCard(content: CardContent): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1b1640");
  gradient.addColorStop(1, "#0d2a52");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle speed lines.
  ctx.strokeStyle = "rgba(124, 92, 255, 0.25)";
  ctx.lineWidth = 6;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-100 + i * 70, height);
    ctx.lineTo(500 + i * 70, 0);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(`⚡ ${brand.name}`, 80, 110);

  ctx.font = "700 84px system-ui, -apple-system, Segoe UI, sans-serif";
  wrap(ctx, content.headline, 80, 270, width - 160, 96);

  ctx.fillStyle = "#c7c2ff";
  ctx.font = "500 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(content.detail, 80, 470);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "400 30px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(content.footer ?? brand.tagline, 80, 560);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = word;
      row += 1;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight);
}

/** Opens the share sheet with the image when possible, otherwise downloads it. */
export async function shareCard(blob: Blob, text: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], `${brand.name.toLowerCase()}-result.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
