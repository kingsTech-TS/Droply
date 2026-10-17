import type { Metadata } from "next";
import { RoomScreen } from "@/components/room/room-screen";
import { safeDecode } from "@/lib/utils/safe-decode";

export const metadata: Metadata = {
  title: "Room",
  robots: { index: false, follow: false },
};

export default async function RoomPage({ params }: PageProps<"/room/[roomId]">) {
  const { roomId } = await params;
  return <RoomScreen roomId={safeDecode(roomId).slice(0, 80)} />;
}
