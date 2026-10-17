"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FolderUpIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils/cn";
import { collectDroppedFiles, supportsFolderSelection } from "@/lib/utils/dropped-files";

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  title?: string;
  className?: string;
}

/**
 * Drag-and-drop area with a regular "Select files" button, so it works with the keyboard,
 * screen readers and touch. Selected files stay as File objects; nothing is read here.
 */
export function DropZone({ onFiles, disabled = false, compact = false, title = "Drop files here", className }: DropZoneProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const folders = useIsClient() && supportsFolderSelection();
  const depth = useRef(0);
  const headingId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Folder selection is not in React's input props.
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, [folders]);

  const emit = (files: File[]) => {
    if (files.length > 0 && !disabled) onFiles(files);
  };

  const onDragEnter = (event: DragEvent) => {
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    emit(await collectDroppedFiles(event.dataTransfer));
  };

  return (
    <motion.section
      aria-labelledby={headingId}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      animate={reduceMotion ? undefined : { scale: dragging ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-8" : "px-6 py-12 sm:py-16",
        dragging ? "border-primary bg-primary/8" : "border-border bg-card/60",
        disabled && "opacity-60",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-14 items-center justify-center rounded-2xl transition-colors",
          dragging ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
        )}
      >
        <UploadIcon className="size-6" />
      </span>
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {dragging ? "Drop files to send" : title}
        </h2>
        <p className="text-sm text-muted-foreground">or</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="lg" onClick={() => fileInput.current?.click()} disabled={disabled}>
          Select files
        </Button>
        {folders ? (
          <Button size="lg" variant="outline" onClick={() => folderInput.current?.click()} disabled={disabled}>
            <FolderUpIcon aria-hidden />
            Select folder
          </Button>
        ) : null}
      </div>
      {!compact ? (
        <p className="text-xs text-muted-foreground">Documents · Videos · Images · Audio · ZIP · Anything</p>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          emit(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {folders ? (
        <input
          ref={folderInput}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            emit(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      ) : null}
    </motion.section>
  );
}
