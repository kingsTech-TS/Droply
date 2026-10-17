import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { RoomLinkJoin } from "@/components/room/room-link-join";
import { safeDecode } from "@/lib/utils/safe-decode";

export const metadata: Metadata = {
  title: "Join room",
  // The link is a secret capability; keep it out of search engines and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RoomLinkPage({ params }: PageProps<"/r/[key]">) {
  const { key } = await params;
  return (
    <>
      <Header />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <RoomLinkJoin linkKey={safeDecode(key).slice(0, 128)} />
      </main>
    </>
  );
}
