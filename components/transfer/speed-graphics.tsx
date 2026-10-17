import { cn } from "@/lib/utils/cn";

/** A tiny live graph of the last ~30 s of speed. Decorative: the numbers carry the meaning. */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const width = 120;
  const height = 32;
  if (values.length < 2) return <svg aria-hidden width={width} height={height} className={className} />;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("text-electric", className)}>
      <polyline points={`0,${height} ${points.join(" ")} ${width},${height}`} fill="currentColor" opacity={0.12} />
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Log scale from 100 kB/s to 1 GB/s, so slow and fast links both move the needle.
const MIN_SPEED = 1e5;
const MAX_SPEED = 1e9;

function gaugeFraction(speed: number): number {
  if (speed <= MIN_SPEED) return 0;
  return Math.min(1, Math.log10(speed / MIN_SPEED) / Math.log10(MAX_SPEED / MIN_SPEED));
}

/** Speedometer-style gauge. The label next to it states the exact value. */
export function SpeedGauge({ speed, size = 120, className }: { speed: number | null; size?: number; className?: string }) {
  const fraction = speed ? gaugeFraction(speed) : 0;
  const r = 44;
  const cx = 60;
  const cy = 56;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const needle = Math.PI * (1 - fraction);
  return (
    <svg aria-hidden width={size} height={size * 0.6} viewBox="0 0 120 72" className={className}>
      <path d={arc(0, 1)} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={10} strokeLinecap="round" />
      {fraction > 0 ? (
        <path d={arc(0, Math.max(0.01, fraction))} fill="none" className="text-primary" stroke="currentColor" strokeWidth={10} strokeLinecap="round" style={{ transition: "d 0.4s ease-out" }} />
      ) : null}
      <line
        x1={cx}
        y1={cy}
        x2={(cx + (r - 8) * Math.cos(needle)).toFixed(2)}
        y2={(cy - (r - 8) * Math.sin(needle)).toFixed(2)}
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        style={{ transition: "all 0.4s ease-out" }}
      />
      <circle cx={cx} cy={cy} r={4} fill="currentColor" />
    </svg>
  );
}
