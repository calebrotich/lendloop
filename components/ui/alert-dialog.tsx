"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Tone = "default" | "danger";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger colouring for irreversible or destructive actions. */
  tone?: Tone;
  icon?: LucideIcon;
  /** Shows a spinner and blocks dismissing while the action is in flight. */
  loading?: boolean;
  onConfirm: () => void;
  /** Optional summary or extra detail shown above the actions. */
  children?: ReactNode;
}

/**
 * A small, deliberately unambiguous confirmation step.
 *
 * It uses the native `<dialog>` element so the browser gives us the modal
 * top layer, inert background, focus trapping and Escape handling for free.
 * The first focusable element — the cancel button — is focused by default, so
 * a stray Enter never confirms a decision.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  tone = "default",
  icon,
  loading = false,
  onConfirm,
  children,
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const Glyph = icon ?? (tone === "danger" ? AlertTriangle : CheckCircle2);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function requestClose() {
    if (loading) return;
    onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // A decision that is already being written must not be dismissed
        // halfway through; let the mutation settle first.
        if (loading) event.preventDefault();
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        // Clicks on the backdrop target the dialog itself; clicks inside the
        // panel target its children.
        if (event.target === event.currentTarget) requestClose();
      }}
      className="alert-dialog m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-[28px] border border-rule bg-white p-0 text-navy shadow-float outline-none"
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              tone === "danger" ? "bg-[#fef3f2] text-[#b42318]" : "bg-mist text-brand"
            }`}
          >
            <Icon icon={Glyph} size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] text-ink-muted uppercase">
              Please confirm
            </p>
            <h2
              id={titleId}
              className="font-display mt-1 text-[24px] leading-[1.08] text-balance text-navy"
            >
              {title}
            </h2>
          </div>
        </div>

        <div id={descriptionId} className="mt-3.5 text-[13px] leading-relaxed text-ink-muted">
          {description}
        </div>

        {children !== undefined && <div className="mt-3.5">{children}</div>}

        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-rule/70 pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={requestClose} disabled={loading} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
