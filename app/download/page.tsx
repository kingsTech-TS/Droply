import type { Metadata } from "next";
import Link from "next/link";
import { GlobeIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";
import { AndroidDownloadButton, androidAppFacts } from "@/components/app-download/android-download";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { env } from "@/config/env";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Download the Droply app for Android.",
};

const STEPS = [
  { title: "Download", body: "Tap Download for Android on your phone. The file is called Droply.apk." },
  { title: "Open it", body: "Open it from the download notification, or from the Downloads (Files) app." },
  {
    title: "Allow the install",
    body: "Android asks once to let your browser install apps (Install unknown apps). Turn it on, then go back.",
  },
  {
    title: "Install and open",
    body: "Tap Install. Play Protect may warn you because the app isn't in the Play Store yet: choose Install anyway.",
  },
] as const;

export default function DownloadPage() {
  const { url, sha256 } = env.androidApp;
  const facts = androidAppFacts();
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-4 py-12 sm:px-6">
        <section className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <SmartphoneIcon aria-hidden className="size-8" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Droply for Android</h1>
          <p className="max-w-lg text-lg text-muted-foreground text-balance">
            Share files between your phone and any device. The app joins the same rooms as the website.
          </p>
          {url ? (
            <>
              <AndroidDownloadButton />
              {facts ? <p className="text-sm text-muted-foreground">{facts}</p> : null}
            </>
          ) : (
            <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              The Android app isn&apos;t available for download yet. You can use Droply in your phone&apos;s browser in the meantime.
            </p>
          )}
        </section>

        {url ? (
          <section aria-labelledby="install-heading" className="space-y-4">
            <h2 id="install-heading" className="text-xl font-semibold">
              How to install
            </h2>
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-xl border bg-card p-4">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            {sha256 ? (
              <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
                <ShieldCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">Check the file (optional)</p>
                  <p className="text-muted-foreground">Its SHA-256 fingerprint should be:</p>
                  <code className="block break-all rounded bg-background px-2 py-1 font-mono text-xs">{sha256}</code>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="other-heading" className="flex gap-3 rounded-xl border p-4">
          <GlobeIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h2 id="other-heading" className="font-medium">
              iPhone, iPad or computer?
            </h2>
            <p className="text-sm text-muted-foreground">
              There&apos;s no iPhone app yet. Droply works in any modern browser: just{" "}
              <Link href="/" className="text-primary hover:underline">
                open the website
              </Link>
              . On iPhone, tap Share → Add to Home Screen to keep it one tap away.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
