import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { MyDevicesManager } from "@/components/pairing/my-devices-manager";

export const metadata: Metadata = { title: "My devices" };

export default function MyDevicesPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">My devices &amp; room link</h1>
        <MyDevicesManager />
      </main>
      <Footer />
    </>
  );
}
