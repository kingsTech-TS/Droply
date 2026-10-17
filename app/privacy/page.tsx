import type { Metadata } from "next";
import { CheckIcon, XIcon } from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "What our server sees" };

const SEES = [
  ["Room code and expiry", "So devices can find each other."],
  ["Device names, types and browsers", "Shown to the other devices in the room."],
  ["File names, sizes and types", "So the other device can approve the transfer. Not stored after the room ends."],
  ["Transfer progress (which chunks arrived)", "So an interrupted transfer can resume."],
  ["Your IP address, as a keyed hash", "For rate limits and, only if a host turns it on, nearby discovery."],
  ["Connection setup messages", "Relayed between devices, never stored."],
] as const;

const NEVER = [
  ["File contents", "They go directly between devices, encrypted (DTLS)."],
  ["Texts and chat messages", "Sent over the same encrypted peer-to-peer connection."],
  ["Your pairing and room-link keys", "Only a keyed hash, which can't be turned back into the key."],
  ["Your history, stats and badges", "Kept on your device only."],
  ["Accounts, emails or phone numbers", "There are none."],
] as const;

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-12 sm:px-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">What our server sees</h1>
          <p className="text-lg text-muted-foreground">
            {brand.name}&apos;s server only introduces your devices to each other. Here is exactly what passes through it, and what never does.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">The server sees</h2>
          <ul className="space-y-3">
            {SEES.map(([what, why]) => (
              <li key={what} className="flex gap-3">
                <CheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">{what}</p>
                  <p className="text-sm text-muted-foreground">{why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">The server never sees</h2>
          <ul className="space-y-3">
            {NEVER.map(([what, why]) => (
              <li key={what} className="flex gap-3">
                <XIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                <div>
                  <p className="font-medium">{what}</p>
                  <p className="text-sm text-muted-foreground">{why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">About relays</h2>
          <p className="text-muted-foreground">
            When two devices can&apos;t connect directly (some company and mobile networks block it), data goes through a relay
            server (TURN). It stays encrypted end to end, and the room shows &quot;Relay connection&quot; so you always know. To check
            that nobody is in the middle, compare the security code (four emoji) in a device&apos;s menu on both screens.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
