"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DeviceIcon } from "@/components/room/device-icon";
import type { DeviceView } from "@/types/device";

export interface RecipientSelectorProps {
  devices: DeviceView[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

export function RecipientSelector({ devices, selected, onChange }: RecipientSelectorProps) {
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  if (devices.length === 0) {
    return <p className="text-sm text-muted-foreground">No other devices are online yet. Share the room code to add one.</p>;
  }

  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <legend className="font-semibold">Send to</legend>
        {devices.length > 1 ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onChange(new Set(devices.map((d) => d.device_id)))}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(new Set())}>
              Clear all
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
        {devices.map((device) => {
          const id = `recipient-${device.device_id}`;
          return (
            <li key={device.device_id}>
              <Label
                htmlFor={id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 font-normal hover:bg-accent/60"
              >
                <Checkbox
                  id={id}
                  checked={selected.has(device.device_id)}
                  onCheckedChange={(checked) => toggle(device.device_id, checked === true)}
                />
                <DeviceIcon type={device.device_type} className="text-muted-foreground" />
                <span className="min-w-0 truncate">{device.device_name}</span>
              </Label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
