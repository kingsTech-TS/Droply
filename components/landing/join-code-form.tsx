"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/utils/room-code";
import { cn } from "@/lib/utils/cn";

export function JoinCodeForm({ className }: { className?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const valid = isValidRoomCode(code);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) router.push(`/join/${code}`);
  };

  return (
    <form onSubmit={submit} className={cn("mx-auto w-full max-w-sm space-y-2", className)} noValidate>
      <label htmlFor={inputId} className="block text-center text-sm font-medium">
        Join with a room code
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={code}
          onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
          placeholder="K7X9PQ"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH + 4}
          aria-invalid={touched && !valid}
          aria-describedby={`${inputId}-hint`}
          className="text-center font-mono text-lg uppercase tracking-[0.3em]"
        />
        <Button type="submit" disabled={code.length === 0}>
          Join
        </Button>
      </div>
      <p id={`${inputId}-hint`} className={cn("text-center text-xs text-muted-foreground", touched && !valid && "text-destructive")}>
        {touched && !valid ? `Room codes have ${ROOM_CODE_LENGTH} letters and numbers.` : "Find the code on the other device."}
      </p>
    </form>
  );
}
