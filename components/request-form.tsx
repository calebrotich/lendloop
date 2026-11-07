"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { appErrorMessage } from "@/lib/convex-error";
import { todayInput } from "@/lib/format";

const requestSchema = z
  .object({
    startDate: z.string().min(1, "Pick a start date."),
    endDate: z.string().min(1, "Pick an end date."),
    note: z.string().max(300, "At most 300 characters.").optional(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: "The end date must be on or after the start.",
    path: ["endDate"],
  });

type RequestValues = z.infer<typeof requestSchema>;

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent";

export function RequestForm({
  toolId,
  onDone,
  onCancel,
}: {
  toolId: Id<"tools">;
  onDone: () => void;
  onCancel: () => void;
}) {
  const create = useMutation(api.requests.create);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { startDate: "", endDate: "", note: "" },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await create({
        toolId,
        startDate: values.startDate,
        endDate: values.endDate,
        note: values.note === "" ? undefined : values.note,
      });
      onDone();
    } catch (error) {
      setError("root", { message: appErrorMessage(error) });
    }
  });

  return (
    <form noValidate onSubmit={submit} className="mt-3 grid gap-3 rounded-lg bg-surface p-4">
      {errors.root?.message !== undefined && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.root.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">From</span>
          <input
            type="date"
            min={todayInput()}
            {...register("startDate")}
            className={FIELD}
            aria-invalid={errors.startDate !== undefined}
          />
          {errors.startDate?.message !== undefined && (
            <span className="text-xs text-red-600">{errors.startDate.message}</span>
          )}
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium">To</span>
          <input
            type="date"
            min={todayInput()}
            {...register("endDate")}
            className={FIELD}
            aria-invalid={errors.endDate !== undefined}
          />
          {errors.endDate?.message !== undefined && (
            <span className="text-xs text-red-600">{errors.endDate.message}</span>
          )}
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">
          Note <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <textarea
          {...register("note")}
          rows={2}
          placeholder="What you need it for, and when you can pick it up."
          className={FIELD}
        />
        {errors.note?.message !== undefined && (
          <span className="text-xs text-red-600">{errors.note.message}</span>
        )}
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        The owner sees your name, the dates and this note — nothing else.
      </p>
    </form>
  );
}
