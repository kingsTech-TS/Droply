import type { Metadata } from "next";
import { StatsView } from "@/components/history/stats-view";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = { title: "Stats & badges" };

export default function StatsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10 sm:px-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Your Droply stats</h1>
          <p className="text-muted-foreground">Calculated on this device from your local history. Nothing is uploaded.</p>
        </div>
        <StatsView />
      </main>
      <Footer />
    </>
  );
}
