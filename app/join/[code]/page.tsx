import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { JoinForm } from "@/components/room/join-form";
import { safeDecode } from "@/lib/utils/safe-decode";

export const metadata: Metadata = {
  title: "Join room",
  // Join links contain the room's secret code; keep them out of search engines.
  robots: { index: false, follow: false },
};

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  return (
    <>
      <Header />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <JoinForm initialCode={safeDecode(code).slice(0, 32)} />
      </main>
    </>
  );
}
