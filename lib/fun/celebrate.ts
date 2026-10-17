// Confetti, sounds and haptics. All of it is optional (preferences), respects reduced
// motion, and uses no assets: sounds are synthesized with Web Audio.
import { preferences, prefersReducedMotion } from "./prefs";
import { activeRoomTheme, THEME_STYLES } from "./themes";

/** A short confetti burst on a full-screen canvas that removes itself. */
export function confetti(intensity: "small" | "big" = "small"): void {
  if (typeof document === "undefined" || prefersReducedMotion() || !preferences.get().celebrations) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const colors = THEME_STYLES[activeRoomTheme() ?? "default"].confetti;
  const count = intensity === "big" ? 160 : 80;
  const particles = Array.from({ length: count }, () => ({
    x: canvas.width * (0.3 + Math.random() * 0.4),
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 18 * dpr,
    vy: (-Math.random() * 16 - 6) * dpr,
    size: (4 + Math.random() * 5) * dpr,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  }));
  const started = performance.now();
  const duration = intensity === "big" ? 2200 : 1600;
  const frame = (now: number) => {
    const elapsed = now - started;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
    for (const p of particles) {
      p.vy += 0.45 * dpr;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined" || !preferences.get().sound) return null;
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio ??= new Ctor();
  if (audio.state === "suspended") void audio.resume().catch(() => undefined);
  return audio;
}

function tone(ctx: AudioContext, frequency: number, start: number, length: number, volume: number, type: OscillatorType = "sine"): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.05);
}

export type SoundName = "send" | "receive" | "request" | "record";

/** Short synthesized sounds: a rising whoosh for send, a chime for receive. */
export function playSound(name: SoundName): void {
  const ctx = context();
  if (!ctx) return;
  try {
    if (name === "send") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (name === "receive") {
      tone(ctx, 784, 0, 0.18, 0.09);
      tone(ctx, 1047, 0.12, 0.3, 0.08);
    } else if (name === "request") {
      tone(ctx, 660, 0, 0.12, 0.06);
      tone(ctx, 660, 0.16, 0.12, 0.06);
    } else {
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, i * 0.09, 0.22, 0.07, "triangle"));
    }
  } catch {
    // Audio is decoration; never let it break anything.
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!preferences.get().haptics || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

/**
 * The "flight path": a file icon flies between two elements (this list → the recipient's
 * card when sending, the sender's card → this list when receiving). Skipped when either end
 * is off screen, with reduced motion, or when celebrations are off.
 */
export function flyFile(from: Element | null, to: Element | null): void {
  if (!from || !to || typeof document === "undefined") return;
  if (prefersReducedMotion() || !preferences.get().celebrations) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const visible = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  if (!visible(a) || !visible(b)) return;
  const icon = document.createElement("div");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📄";
  icon.style.cssText =
    "position:fixed;left:0;top:0;font-size:28px;line-height:1;pointer-events:none;z-index:100;will-change:transform";
  document.body.appendChild(icon);
  const x0 = a.left + a.width / 2 - 14;
  const y0 = a.top + Math.min(a.height / 2, 24) - 14;
  const x1 = b.left + b.width / 2 - 14;
  const y1 = b.top + Math.min(b.height / 2, 32) - 14;
  // A gentle arc: the midpoint is lifted above the straight line.
  const lift = Math.min(160, Math.hypot(x1 - x0, y1 - y0) / 3);
  const xm = (x0 + x1) / 2;
  const ym = Math.min(y0, y1) - lift;
  const animation = icon.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.6) rotate(-10deg)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0}px) scale(1) rotate(-10deg)`, opacity: 1, offset: 0.1 },
      { transform: `translate(${xm}px, ${ym}px) scale(1.15) rotate(8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.5) rotate(0deg)`, opacity: 0 },
    ],
    { duration: 900, easing: "cubic-bezier(.45,.05,.35,1)" },
  );
  animation.onfinish = () => icon.remove();
  animation.oncancel = () => icon.remove();
  to.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 300, delay: 850 });
}
