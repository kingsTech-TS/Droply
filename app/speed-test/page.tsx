import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SpeedTestStart } from "@/components/landing/speed-test-start";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Device-to-device speed test",
  description: "How fast can your two devices talk? Measure the direct connection between your phone and laptop in your browser.",
};

export default function SpeedTestPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-8 px-4 py-16 text-center sm:px-6">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">How fast can your devices talk?</h1>
          <p className="text-lg text-muted-foreground text-balance">
            Measure the direct connection between two of your devices, over your Wi-Fi or across the internet. Uses test data only:
            no files, nothing saved.
          </p>
        </div>
        <SpeedTestStart />
        <ol className="grid w-full gap-3 text-left sm:grid-cols-3">
          {[
            ["1", "Start the test on this device."],
            ["2", "Scan the QR code with your other device."],
            ["3", "Watch the speedometer and share your result."],
          ].map(([n, text]) => (
            <li key={n} className="rounded-xl border bg-card p-4">
              <span className="font-mono text-sm text-muted-foreground">0{n}</span>
              <p className="mt-1">{text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Results depend on both devices, the network between them and whether {brand.name} can connect directly or needs a relay.
        </p>
      </main>
      <Footer />
    </>
  );
}
