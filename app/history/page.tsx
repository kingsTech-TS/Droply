import type { Metadata } from "next";
import { HistoryTabs } from "@/components/history/history-tabs";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10 sm:px-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          <p className="text-muted-foreground">Your transfers and rooms. Stored on this device only, never uploaded.</p>
        </div>
        <HistoryTabs />
      </main>
      <Footer />
    </>
  );
}
