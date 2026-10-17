import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceCard } from "@/components/room/device-card";
import { RoomCode } from "@/components/room/room-code";
import { DropZone } from "@/components/transfer/drop-zone";
import { RecipientSelector } from "@/components/transfer/recipient-selector";
import { SendPanel } from "@/components/transfer/send-panel";
import { TransferCard, type TransferCardActions } from "@/components/transfer/transfer-card";
import { TransferProgress } from "@/components/transfer/transfer-progress";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import type { DeviceView } from "@/types/device";

const device = (id: string, name: string, extra: Partial<DeviceView> = {}): DeviceView => ({
  device_id: id,
  device_name: name,
  device_type: "phone",
  browser: "Safari",
  operating_system: "iOS",
  joined_at: "2026-01-01T00:00:00Z",
  last_seen: "2026-01-01T00:00:00Z",
  connection_state: "connected",
  is_host: false,
  ...extra,
});

const link = (partial: Partial<LinkInfo>): LinkInfo => ({
  peerId: "dv_b",
  status: "connected",
  connectionId: "pc-1",
  path: "lan",
  quality: "excellent",
  rttMs: 12,
  connectionState: "connected",
  iceConnectionState: "connected",
  channelState: "open",
  localCandidateType: "host",
  remoteCandidateType: "host",
  attempts: 0,
  frameSize: 65536,
  securityCode: "🐙 🚀 🍕 🌵",
  relayOnly: false,
  ...partial,
});

function item(partial: Partial<TransferSnapshot> = {}, leg: Partial<TransferSnapshot["legs"][number]> = {}): TransferSnapshot {
  return {
    localId: "f_1",
    transferId: "tr_1",
    direction: "outgoing",
    batchId: "b_1",
    peerIds: ["dv_b"],
    fileName: "campus-event.mp4",
    fileSize: 2_800_000_000,
    mimeType: "video/mp4",
    createdAt: 1,
    legs: [
      {
        deviceId: "dv_b",
        status: "transferring",
        verifiedBytes: 2_300_000_000,
        speed: 87_400_000,
        averageSpeed: 79_200_000,
        etaSeconds: 6,
        failureReason: null,
        autoResume: false,
        peakSpeed: 112_000_000,
        speedHistory: [70_000_000, 80_000_000, 87_400_000],
        activeSeconds: 26,
        ...leg,
      },
    ],
    verification: "pending",
    save: "none",
    needsReselect: false,
    error: null,
    relativePath: null,
    reactions: [],
    canResend: true,
    ...partial,
  };
}

const actions = (): TransferCardActions => ({
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  save: vi.fn(),
  dismiss: vi.fn(),
  reselect: vi.fn(),
});

describe("DropZone", () => {
  it("has a real 'Select files' button that opens the file picker", async () => {
    const onFiles = vi.fn();
    const { container } = render(<DropZone onFiles={onFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await userEvent.click(screen.getByRole("button", { name: "Select files" }));
    expect(click).toHaveBeenCalled();
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("shows the drag state and accepts dropped files", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);
    const region = screen.getByRole("region", { name: "Drop files here" });
    const file = new File(["x"], "x.bin");
    const dataTransfer = { types: ["Files"], files: [file], items: [], dropEffect: "none" };
    fireEvent.dragEnter(region, { dataTransfer });
    expect(screen.getByRole("heading", { name: "Drop files to send" })).toBeInTheDocument();
    fireEvent.drop(region, { dataTransfer });
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]));
  });

  it("does nothing when disabled", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} disabled />);
    expect(screen.getByRole("button", { name: "Select files" })).toBeDisabled();
  });
});

describe("DeviceCard", () => {
  it("shows name, platform and status as text (not color alone)", () => {
    render(<DeviceCard device={device("dv_b", "John's iPhone")} link={link({})} onSend={() => undefined} />);
    expect(screen.getByText("John's iPhone")).toBeInTheDocument();
    expect(screen.getByText("iOS • Safari")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Direct connection")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("never claims a direct path before stats confirm it", () => {
    render(<DeviceCard device={device("dv_b", "Phone")} link={link({ path: "unknown" })} />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.queryByText("Direct connection")).not.toBeInTheDocument();
  });

  it("shows relay honestly and offers retry after failure", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<DeviceCard device={device("dv_b", "Phone")} link={link({ path: "relay" })} />);
    expect(screen.getByText("Relay connection")).toBeInTheDocument();
    rerender(<DeviceCard device={device("dv_b", "Phone")} link={link({ status: "failed" })} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("disables sending to offline devices", () => {
    render(<DeviceCard device={device("dv_b", "Phone", { connection_state: "reconnecting" })} onSend={() => undefined} />);
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send files/ })).toBeDisabled();
  });
});

describe("TransferProgress", () => {
  it("renders an accessible progress bar from verified bytes", () => {
    render(
      <TransferProgress
        fileName="video.mp4"
        showRates
        progress={{
          verifiedBytes: 2_300_000_000,
          totalBytes: 2_800_000_000,
          fraction: 2.3 / 2.8,
          speed: 87_400_000,
          averageSpeed: null,
          etaSeconds: 6,
          peakSpeed: 112_000_000,
          speedHistory: [60_000_000, 87_400_000],
          activeSeconds: 26,
        }}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "video.mp4 progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("2.30 GB / 2.80 GB")).toBeInTheDocument();
    expect(screen.getByText("87.4 MB/s")).toBeInTheDocument();
    expect(screen.getByText("~6 seconds left")).toBeInTheDocument();
  });
});

describe("TransferCard", () => {
  it("shows pause and cancel while transferring", async () => {
    const a = actions();
    render(<TransferCard item={item()} deviceName={() => "John's iPhone"} link={link({})} actions={a} />);
    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(screen.getByText("To John's iPhone")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(a.pause).toHaveBeenCalled();
  });

  it("asks before cancelling a large active transfer", async () => {
    const a = actions();
    render(<TransferCard item={item()} deviceName={() => "Phone"} link={undefined} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Cancel this transfer?");
    expect(a.cancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep transfer" }));
    expect(a.cancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel transfer" }));
    expect(a.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows resume when paused by a person, and waiting when the connection dropped", () => {
    const { rerender } = render(
      <TransferCard item={item({}, { status: "paused", speed: null })} deviceName={() => "Phone"} link={undefined} actions={actions()} />,
    );
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    rerender(
      <TransferCard item={item({}, { status: "paused", autoResume: true })} deviceName={() => "Phone"} link={undefined} actions={actions()} />,
    );
    expect(screen.getByText("Connection interrupted. Waiting to reconnect…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("shows completion, verification and Save for received files", async () => {
    const a = actions();
    render(
      <TransferCard
        item={item({ direction: "incoming", verification: "verified", save: "ready" }, { status: "completed", verifiedBytes: 2_800_000_000 })}
        deviceName={() => "Laptop"}
        link={undefined}
        actions={a}
      />,
    );
    expect(screen.getByText("Transfer complete")).toBeInTheDocument();
    expect(screen.getByText("File verified")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open / Save" }));
    expect(a.save).toHaveBeenCalled();
  });

  it("never reports a failed verification as success", () => {
    render(
      <TransferCard
        item={item({ direction: "incoming", verification: "failed" }, { status: "failed", failureReason: "integrity" })}
        deviceName={() => "Laptop"}
        link={undefined}
        actions={actions()}
      />,
    );
    expect(screen.getByText("File verification failed")).toBeInTheDocument();
    expect(screen.queryByText("Transfer complete")).not.toBeInTheDocument();
  });

  it("asks to re-select the file after a reload", () => {
    render(<TransferCard item={item({ needsReselect: true }, { status: "paused" })} deviceName={() => "Phone"} link={undefined} actions={actions()} />);
    expect(screen.getByText("Select the file again to resume")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select file" })).toBeInTheDocument();
  });
});

describe("RoomCode", () => {
  it("shows the code and copies it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RoomCode code="K7X9PQ" joinUrl="https://droply.test/join/K7X9PQ" />);
    expect(screen.getByText("K7X 9PQ")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith("K7X9PQ");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenLastCalledWith("https://droply.test/join/K7X9PQ");
  });
});

describe("RecipientSelector and SendPanel", () => {
  const devices = [device("dv_b", "John's iPhone"), device("dv_c", "Mary's Samsung")];

  it("supports select all, clear all and individual toggles", async () => {
    const onChange = vi.fn();
    render(<RecipientSelector devices={devices} selected={new Set(["dv_b"])} onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "John's iPhone" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mary's Samsung" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set(["dv_b", "dv_c"]));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
    await userEvent.click(screen.getByRole("checkbox", { name: "Mary's Samsung" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set(["dv_b", "dv_c"]));
  });

  it("explains why Send is disabled, lists files and removes them", async () => {
    const onRemove = vi.fn();
    const onSend = vi.fn();
    const files = [
      { id: "1", name: "report.pdf", size: 4_000_000, type: "application/pdf" },
      { id: "2", name: "photos.zip", size: 780_000_000, type: "application/zip" },
    ];
    const { rerender } = render(
      <SendPanel files={files} recipients={devices} selected={new Set()} onSelectedChange={() => undefined} onRemove={onRemove} onClear={() => undefined} onSend={onSend} />,
    );
    expect(screen.getByText("Files ready to send")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send 2 files" })).toBeDisabled();
    expect(screen.getByText("Choose a recipient")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove report.pdf" }));
    expect(onRemove).toHaveBeenCalledWith("1");

    rerender(
      <SendPanel files={files} recipients={devices} selected={new Set(["dv_b"])} onSelectedChange={() => undefined} onRemove={onRemove} onClear={() => undefined} onSend={onSend} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Send 2 files" }));
    expect(onSend).toHaveBeenCalled();
  });
});
