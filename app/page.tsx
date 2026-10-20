import { Suspense } from "react";
import { LockIcon, MonitorSmartphoneIcon, QrCodeIcon, RocketIcon, SendIcon, SmartphoneIcon, ZapIcon } from "lucide-react";
import { AndroidAppBanner } from "@/components/app-download/android-app-banner";
import { GetTheApp } from "@/components/app-download/android-download";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ActiveRooms } from "@/components/landing/active-rooms";
import { JoinCodeForm } from "@/components/landing/join-code-form";
import { MyDevices } from "@/components/landing/my-devices";
import { NearbyRooms } from "@/components/landing/nearby-rooms";
import { StartSharing } from "@/components/landing/start-sharing";
import { brand } from "@/config/brand";

const FEATURES = [
  {
    icon: ZapIcon,
    title: "Direct transfers",
    body: "Files move directly between compatible devices, over your local network when possible.",
  },
  {
    icon: LockIcon,
    title: "Private",
    body: "Your files don't need to pass through our servers, and they're encrypted in transit.",
  },
  {
    icon: MonitorSmartphoneIcon,
    title: "Cross-platform",
    body: "Phone, tablet, laptop, desktop. Just a browser, or the Android app.",
  },
  {
    icon: RocketIcon,
    title: "Built for large files",
    body: "Designed for videos, archives and projects, with pause, resume and verification.",
  },
] as const;

const STEPS = [
  { icon: SendIcon, title: "Create a room", body: "Drop your files or create an empty room." },
  { icon: QrCodeIcon, title: "Connect your device", body: "Scan the QR code or type the room code." },
  { icon: SmartphoneIcon, title: "Send files directly", body: "Pick a device, it accepts, the files flow." },
] as const;

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <AndroidAppBanner />
          <div className="mb-8 space-y-3 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{brand.tagline}</h1>
            <p className="text-lg text-muted-foreground text-balance">Transfer files directly between your devices.</p>
          </div>
          <div className="mb-6 space-y-4">
            <ActiveRooms />
            <NearbyRooms />
            <MyDevices />
          </div>
          <Suspense fallback={null}>
            <StartSharing />
          </Suspense>
          <div className="my-8 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <JoinCodeForm />
        </section>

        <section aria-labelledby="speed-heading" className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="speed-heading" className="mb-8 text-center text-2xl font-semibold tracking-tight">
              Built for speed
            </h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-xl border bg-card p-5">
                  <Icon aria-hidden className="mb-3 size-6 text-primary" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <GetTheApp className="bg-muted/30" />

        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-heading" className="mb-8 text-center text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, index) => (
                <li key={title} className="flex flex-col items-center gap-3 text-center">
                  <span className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
