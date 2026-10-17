// Speed and ETA from verified bytes only. Current speed is measured over the last 3 s;
// average speed covers active (not paused) time since this page started the leg.

const WINDOW_MS = 3000;
const MIN_ETA_DATA_MS = 2000;

export class SpeedMeter {
  private samples: Array<{ t: number; bytes: number }> = [];
  private activeMs = 0;
  private activeSince: number | null = null;
  private baseBytes: number | null = null;
  private latestBytes = 0;
  private firstDataAt: number | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Marks the leg as actively transferring (counts toward average speed). */
  setActive(active: boolean): void {
    const t = this.now();
    if (active && this.activeSince === null) {
      this.activeSince = t;
    } else if (!active && this.activeSince !== null) {
      this.activeMs += t - this.activeSince;
      this.activeSince = null;
      this.samples = [];
    }
  }

  update(verifiedBytes: number): void {
    const t = this.now();
    this.baseBytes ??= verifiedBytes;
    if (verifiedBytes > this.latestBytes && this.firstDataAt === null && verifiedBytes > this.baseBytes) {
      this.firstDataAt = t;
    }
    this.latestBytes = verifiedBytes;
    this.samples.push({ t, bytes: verifiedBytes });
    while (this.samples.length > 2 && this.samples[0]!.t < t - WINDOW_MS) this.samples.shift();
  }

  /** Bytes per second over the last few seconds, or null without enough data. */
  get current(): number | null {
    if (this.activeSince === null) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t < 250) return null;
    return Math.max(0, ((last.bytes - first.bytes) * 1000) / (last.t - first.t));
  }

  get average(): number | null {
    const active = this.activeMs + (this.activeSince !== null ? this.now() - this.activeSince : 0);
    if (active < 500 || this.baseBytes === null) return null;
    const bytes = this.latestBytes - this.baseBytes;
    return bytes > 0 ? (bytes * 1000) / active : null;
  }

  eta(totalBytes: number): number | null {
    const speed = this.current;
    if (speed === null || speed <= 0 || this.firstDataAt === null) return null;
    if (this.now() - this.firstDataAt < MIN_ETA_DATA_MS) return null;
    return Math.max(0, (totalBytes - this.latestBytes) / speed);
  }
}
