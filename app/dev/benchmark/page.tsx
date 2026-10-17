import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Benchmark } from "@/components/dev/benchmark";
import { Header } from "@/components/layout/header";
import { env } from "@/config/env";

export const metadata: Metadata = { title: "Benchmark", robots: { index: false, follow: false } };

/** Development only: hidden unless NEXT_PUBLIC_ENABLE_BENCHMARK=true. */
export default function BenchmarkPage() {
  if (!env.benchmarkEnabled) notFound();
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Transfer benchmark</h1>
          <p className="text-muted-foreground">Tune chunk size, frame size, buffer threshold, window and concurrency.</p>
        </div>
        <Benchmark />
      </main>
    </>
  );
}
