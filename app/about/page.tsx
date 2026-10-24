import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-12 sm:px-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">About {brand.name}</h1>
          <p className="text-lg text-muted-foreground">{brand.secondaryTagline}</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">How your files travel</h2>
          <p className="text-muted-foreground">
            Our server only introduces your devices to each other: it creates the room, tells devices who is there and
            passes along the small messages they need to connect. The files themselves travel over a direct WebRTC
            connection between the two browsers.
          </p>
          <p className="text-muted-foreground">
            Devices on the same network connect directly. Across networks, they connect over the internet when
            possible. When neither works (some company or mobile networks block it), the connection may go through a
            relay server. Relayed data stays encrypted, and the app always shows which kind of connection is in use.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Privacy and safety</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>WebRTC encrypts every transfer in transit (DTLS).</li>
            <li>Nobody can send you files without your approval, unless you choose to auto-accept a device.</li>
            <li>Every chunk is checked with SHA-256, so a corrupted file is never reported as complete.</li>
            <li>Rooms stay open until the host closes them, or close by themselves once nobody has used them for a while. Received files are saved to your device and never opened automatically.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Large files</h2>
          <p className="text-muted-foreground">
            Files are read in pieces, never all at once, so even very large files work on phones. If the connection
            drops, the transfer pauses and continues from where it stopped once both devices are back.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
