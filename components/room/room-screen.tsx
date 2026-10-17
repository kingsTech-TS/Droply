"use client";

import { Suspense, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { JoinCodeForm } from "@/components/landing/join-code-form";
import { RoomSessionProvider } from "@/hooks/use-room-session";
import { useRoomTheme } from "@/hooks/use-room-theme";
import { RoomSession } from "@/lib/session/room-session";
import { loadSession } from "@/lib/session/session-store";
import { RoomView } from "./room-view";
import { missingCapability, UnsupportedBrowser } from "./unsupported-browser";

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: "webrtc" | "crypto" }
  | { kind: "no-session" }
  | { kind: "ready"; session: RoomSession };

/** Creates the room's services on mount and disposes them on unmount. */
export function RoomScreen({ roomId }: { roomId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // While the room opens, use the theme saved when this device entered (the live room
  // view takes over once it renders).
  const [savedTheme] = useState(() => (typeof window === "undefined" ? null : (loadSession(roomId)?.theme ?? null)));
  useRoomTheme(state.kind === "loading" ? savedTheme : null);

  useEffect(() => {
    // The room session is an external system (WebSocket, peer connections), so it is
    // created here and published to React once; there is nothing to derive during render.
    const missing = missingCapability();
    if (missing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "unsupported", reason: missing });
      return;
    }
    const stored = loadSession(roomId);
    if (!stored) {
      setState({ kind: "no-session" });
      return;
    }
    const session = new RoomSession(stored, undefined);
    session.start();
    setState({ kind: "ready", session });
    return () => {
      // Not `leave`: closing or reloading the tab keeps the device for the server's grace period.
      session.dispose();
    };
  }, [roomId]);

  if (state.kind === "ready") {
    return (
      <RoomSessionProvider session={state.session}>
        <Suspense>
          <RoomView />
        </Suspense>
      </RoomSessionProvider>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1">
        {state.kind === "unsupported" ? <UnsupportedBrowser reason={state.reason} /> : null}
        {state.kind === "no-session" ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-20 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">You&apos;re not in this room</h1>
              <p className="text-muted-foreground">Enter the room code shown on the other device to join.</p>
            </div>
            <JoinCodeForm />
          </div>
        ) : null}
        {state.kind === "loading" ? (
          <p className="py-20 text-center text-muted-foreground" role="status">
            Opening room…
          </p>
        ) : null}
      </main>
    </>
  );
}
