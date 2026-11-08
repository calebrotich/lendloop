"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { ToolImage } from "@/components/tool-image";
import { appErrorMessage } from "@/lib/convex-error";
import { snapshotFileSelection } from "@/lib/file-selection";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "@/lib/image-upload";
import { LIMITS } from "@/convex/lib/limits";

type PendingStatus = "preparing" | "uploading" | "verifying" | "done" | "error";

interface PendingUpload {
  key: string;
  name: string;
  status: PendingStatus;
  message?: string;
  /** Local object URL, shown before the upload finishes (or if it fails). */
  previewUrl: string | null;
}

const STATUS_LABEL: Record<Exclude<PendingStatus, "error">, string> = {
  preparing: "Preparing preview…",
  uploading: "Uploading…",
  verifying: "Checking…",
  done: "Added",
};

/**
 * A per-upload key that does not depend on a secure context. `randomUUID` is
 * unavailable on plain-HTTP origins and older browsers; throwing there used to
 * happen before the preview tile existed, so the UI appeared to do nothing.
 */
function createUploadKey(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  if (typeof cryptoObject?.getRandomValues === "function") {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function uploadFailureMessage(error: unknown): string {
  const serverMessage = appErrorMessage(error, "");
  if (serverMessage.length > 0) return serverMessage;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "The photo couldn't be uploaded. Try again.";
}

async function uploadErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim().length > 0) return body.error;
  } catch {
    // Fall through to the generic copy.
  }
  return "The photo couldn't be uploaded. Try again.";
}

/**
 * Owner photo editor: upload, retry, remove and choose a cover.
 *
 * A local object URL is rendered the moment a file is picked, before any
 * decoding or network work. That gives immediate feedback and keeps the preview
 * visible if the upload subsequently fails. Uploading remains sequential so the
 * per-listing cap and per-file status are easy to follow.
 */
export function ImageManager({ toolId }: { toolId: Id<"tools"> }) {
  const images = useQuery(api.toolImages.listForTool, { toolId });
  const createTicket = useMutation(api.toolImages.createUploadTicket);
  const completeUpload = useAction(api.toolImages.completeUpload);
  const abandonUpload = useMutation(api.toolImages.abandonUpload);
  const removeImage = useMutation(api.toolImages.removeImage);
  const setCover = useMutation(api.toolImages.setCover);

  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const timeouts = useRef<number[]>([]);
  const uploadInFlight = useRef(false);
  const pendingRef = useRef<PendingUpload[]>([]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const timers = timeouts.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const upload of pendingRef.current) {
        if (upload.previewUrl !== null) URL.revokeObjectURL(upload.previewUrl);
      }
    };
  }, []);

  const savedCount = images?.length ?? 0;
  const activeCount = pending.filter(
    (upload) => upload.status !== "error" && upload.status !== "done",
  ).length;
  const isUploading = pending.some(
    (upload) =>
      upload.status === "preparing" ||
      upload.status === "uploading" ||
      upload.status === "verifying",
  );
  const atLimit = savedCount + activeCount >= LIMITS.maxImagesPerTool;

  const updatePending = (key: string, patch: Partial<PendingUpload>) => {
    setPending((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)),
    );
  };

  const removePending = (key: string) => {
    const target = pendingRef.current.find((upload) => upload.key === key);
    if (target?.previewUrl !== undefined && target.previewUrl !== null) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setPending((current) => current.filter((upload) => upload.key !== key));
  };

  const uploadOne = async (file: File) => {
    const key = createUploadKey();
    let previewUrl: string | null = null;
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      // The upload can proceed without a browser preview.
    }

    setPending((current) => [
      ...current,
      { key, name: file.name, status: "preparing", previewUrl },
    ]);

    let uploadId: Id<"toolImageUploads"> | null = null;
    let stage = "prepare";
    try {
      const prepared = await withTimeout(
        prepareImage(file),
        30_000,
        "Preparing this photo took too long. Try a smaller image.",
      );
      updatePending(key, { status: "uploading" });

      stage = "ticket";
      const ticket = await createTicket({
        toolId,
        contentType: prepared.contentType,
        byteSize: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
      uploadId = ticket.uploadId;

      stage = "proxy";
      const response = await fetch("/api/media/upload", {
        method: "POST",
        headers: {
          "content-type": prepared.contentType,
          "x-lendloop-upload-id": ticket.uploadId,
        },
        body: prepared.blob,
      });

      if (!response.ok) {
        throw new Error(await uploadErrorMessage(response));
      }

      stage = "confirm";
      updatePending(key, { status: "verifying" });
      await completeUpload({ uploadId: ticket.uploadId });
      updatePending(key, { status: "done" });

      const timer = window.setTimeout(() => {
        removePending(key);
      }, 900);
      timeouts.current.push(timer);
    } catch (caught) {
      // Keep the stage in the dev/observability log; the user sees the friendly
      // message below, not a stack trace.
      console.error(`Image upload failed during ${stage}`, caught);
      if (uploadId !== null) {
        await abandonUpload({ uploadId }).catch(() => undefined);
      }
      const message = uploadFailureMessage(caught);
      setError(message);
      updatePending(key, {
        status: "error",
        message,
      });
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (uploadInFlight.current) {
      setError("An upload is already in progress. Wait for it to finish.");
      return;
    }
    setError(null);
    const list = Array.from(files);
    if (list.length === 0) return;

    const slots = LIMITS.maxImagesPerTool - savedCount - activeCount;
    if (slots <= 0) {
      setError(`You already have ${LIMITS.maxImagesPerTool} photos on this listing.`);
      return;
    }

    if (list.length > slots) {
      setError(
        `Only ${slots} more ${slots === 1 ? "photo" : "photos"} will fit — the rest were skipped.`,
      );
    }

    uploadInFlight.current = true;
    try {
      for (const file of list.slice(0, slots)) {
        await uploadOne(file);
      }
    } catch (caught) {
      // Defensive: uploadOne catches its own failures, but a failure while
      // creating the preview tile must still be visible rather than silent.
      setError(uploadFailureMessage(caught));
    } finally {
      uploadInFlight.current = false;
    }
  };

  const removeOne = async (imageId: Id<"toolImages">) => {
    setBusyId(imageId);
    setError(null);
    try {
      await removeImage({ imageId });
      setConfirmRemove(null);
    } catch (caught) {
      setError(appErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  const makeCover = async (imageId: Id<"toolImages">) => {
    setBusyId(imageId);
    setError(null);
    try {
      await setCover({ imageId });
    } catch (caught) {
      setError(appErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby={`photos-${toolId}`}
      aria-busy={isUploading}
      className="rounded-xl border border-line bg-surface-raised p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`photos-${toolId}`} className="text-sm font-medium">
          Photos
        </h3>
        <span className="text-xs text-ink-muted">
          {savedCount + activeCount} of {LIMITS.maxImagesPerTool}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        The first photo is the cover. Your preview appears immediately; upload starts automatically.
        Photos are resized and stripped of location data before they are served publicly.
      </p>

      {error !== null && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!isUploading && !atLimit) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!isUploading && !atLimit) void handleFiles(event.dataTransfer.files);
        }}
        className={`mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors focus-within:border-accent ${
          dragging ? "border-accent bg-accent/5" : "border-line hover:border-accent/50"
        } ${atLimit || isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES}
          disabled={atLimit || isUploading}
          onChange={(event) => {
            const files = snapshotFileSelection(event.currentTarget);
            if (files.length > 0) void handleFiles(files);
          }}
          className="sr-only"
        />
        <span className="text-sm font-medium">
          {isUploading ? "Uploading…" : atLimit ? "Photo limit reached" : "Add photos"}
        </span>
        <span className="mt-0.5 text-xs text-ink-muted">
          {atLimit
            ? `Remove one to add another (max ${LIMITS.maxImagesPerTool}).`
            : "Drag and drop, or click to choose. JPEG, PNG, WebP, AVIF or HEIC."}
        </span>
      </label>

      {(images !== undefined && images.length > 0) || pending.length > 0 ? (
        <ul aria-live="polite" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images?.map((image, index) => (
            <li
              key={image._id}
              className="group relative overflow-hidden rounded-xl border border-line bg-surface"
            >
              <ToolImage
                src={image.url}
                alt={`Photo ${index + 1}`}
                width={image.width}
                height={image.height}
                className="aspect-[4/3] w-full object-cover"
              />
              {index === 0 && (
                <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                  Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-[11px] text-white">
                {index === 0 ? (
                  <span className="opacity-80">Cover</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void makeCover(image._id)}
                    disabled={busyId !== null}
                    className="font-medium underline underline-offset-2 disabled:opacity-60"
                  >
                    Make cover
                  </button>
                )}
                <span className="ml-auto" />
                {confirmRemove === image._id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void removeOne(image._id)}
                      disabled={busyId !== null}
                      className="font-medium underline underline-offset-2 disabled:opacity-60"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      className="opacity-80 underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(image._id)}
                    disabled={busyId !== null}
                    className="underline underline-offset-2 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}

          {pending.map((upload) => (
            <li
              key={upload.key}
              className={`relative aspect-[4/3] overflow-hidden rounded-xl border ${
                upload.status === "error" ? "border-red-300 bg-red-50" : "border-line bg-surface"
              }`}
            >
              {upload.previewUrl !== null && (
                <ToolImage
                  src={upload.previewUrl}
                  alt={`Preview of ${upload.name}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div
                aria-hidden="true"
                className={`absolute inset-0 ${
                  upload.status === "error" ? "bg-red-950/85" : "bg-black/50"
                }`}
              />
              <div className="relative z-10 flex h-full flex-col items-center justify-center px-3 py-3 text-center text-white">
                {upload.status === "error" ? (
                  <>
                    <p className="line-clamp-1 text-[11px] font-medium opacity-90">{upload.name}</p>
                    <p
                      title={upload.message}
                      className="mt-1 line-clamp-3 text-[11px] leading-snug"
                    >
                      {upload.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => removePending(upload.key)}
                      className="mt-2 text-[11px] font-medium underline underline-offset-2"
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <>
                    {upload.status === "done" ? (
                      <span aria-hidden="true" className="text-lg">
                        ✓
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      />
                    )}
                    <p className="mt-2 line-clamp-1 text-[11px] font-medium">{upload.name}</p>
                    <p className="mt-0.5 text-[11px] text-white/80">
                      {STATUS_LABEL[upload.status]}
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">
          No photos yet. Listings with a clear cover photo get more requests.
        </p>
      )}
    </section>
  );
}
