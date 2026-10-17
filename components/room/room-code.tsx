"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatRoomCode } from "@/lib/utils/format";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RoomCode({ code, joinUrl }: { code: string; joinUrl: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (what: "code" | "link") => {
    const ok = await copyText(what === "code" ? code : joinUrl);
    if (!ok) {
      toast.error("Couldn't copy. Select the text and copy it manually.");
      return;
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">Room code</p>
      <p
        className="select-all font-mono text-4xl font-semibold tracking-[0.2em] tabular-nums sm:text-5xl"
        aria-label={`Room code ${code.split("").join(" ")}`}
      >
        {formatRoomCode(code)}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy("code")}>
          {copied === "code" ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy("link")}>
          {copied === "link" ? <CheckIcon aria-hidden /> : <LinkIcon aria-hidden />}
          {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? `${copied === "code" ? "Code" : "Link"} copied` : ""}
      </span>
    </div>
  );
}
