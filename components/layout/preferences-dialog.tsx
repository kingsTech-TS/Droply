"use client";

import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocalStore } from "@/hooks/use-local-store";
import { playSound } from "@/lib/fun/celebrate";
import { preferences, type Preferences } from "@/lib/fun/prefs";

const ROWS: Array<{ key: keyof Preferences; label: string; hint: string }> = [
  { key: "sound", label: "Sounds", hint: "A whoosh when sending, a chime when files arrive." },
  { key: "celebrations", label: "Celebrations", hint: "Confetti for big transfers and records." },
  { key: "haptics", label: "Vibration", hint: "On phones that support it." },
  { key: "notifications", label: "Notifications", hint: "When files or texts arrive while Droply is in the background." },
  { key: "sendSmallerPhotos", label: "Send smaller photos", hint: "Resize large photos before sending (saves time on slow networks)." },
];

export function PreferencesButton() {
  const [open, setOpen] = useState(false);
  const prefs = useLocalStore(preferences);

  const toggle = async (key: keyof Preferences, value: boolean) => {
    if (key === "notifications" && value) {
      if (typeof Notification === "undefined") {
        toast.error("This browser doesn't support notifications.");
        return;
      }
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") {
        toast.error("Notifications are blocked. Allow them in your browser's site settings.");
        return;
      }
    }
    preferences.set({ ...prefs, [key]: value });
    if (key === "sound" && value) playSound("receive");
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Preferences">
        <SettingsIcon aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preferences</DialogTitle>
            <DialogDescription>Saved on this device only.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-4">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-4">
                <Label htmlFor={`pref-${row.key}`} className="flex-col items-start gap-1 font-normal">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-xs text-muted-foreground">{row.hint}</span>
                </Label>
                <Switch id={`pref-${row.key}`} checked={prefs[row.key]} onCheckedChange={(v) => void toggle(row.key, v)} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
