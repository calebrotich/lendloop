"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LIMITS } from "@/convex/lib/limits";
import { appErrorMessage } from "@/lib/convex-error";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from "@/lib/options";

const toolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(LIMITS.nameMin, `At least ${LIMITS.nameMin} characters.`)
    .max(LIMITS.nameMax, `At most ${LIMITS.nameMax} characters.`),
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  description: z
    .string()
    .trim()
    .min(LIMITS.descriptionMin, `At least ${LIMITS.descriptionMin} characters.`)
    .max(LIMITS.descriptionMax, `At most ${LIMITS.descriptionMax} characters.`),
  status: z.enum(["available", "unavailable"]),
});

export type ToolFormValues = z.infer<typeof toolSchema>;

export interface ToolFormProps {
  initial?: Partial<ToolFormValues>;
  submitLabel: string;
  /** Availability is only editable after creation; a new tool starts available. */
  showAvailability?: boolean;
  onSubmit: (values: ToolFormValues) => Promise<void>;
  onCancel: () => void;
}

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent";

export function ToolForm({
  initial,
  submitLabel,
  showAvailability = false,
  onSubmit,
  onCancel,
}: ToolFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<ToolFormValues>({
    resolver: zodResolver(toolSchema),
    defaultValues: {
      name: initial?.name ?? "",
      category: initial?.category ?? "power_tools",
      condition: initial?.condition ?? "good",
      description: initial?.description ?? "",
      status: initial?.status ?? "available",
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      reset();
    } catch (error) {
      // Server-side codes (VALIDATION, FORBIDDEN, CONFLICT) surface here, so the
      // form never claims success the backend refused.
      setError("root", { message: appErrorMessage(error) });
    }
  });

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-4 rounded-xl border border-line bg-surface-raised p-5"
    >
      {errors.root?.message !== undefined && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.root.message}
        </p>
      )}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Name</span>
        <input
          {...register("name")}
          aria-invalid={errors.name !== undefined}
          placeholder="Cordless drill"
          className={FIELD}
        />
        {errors.name?.message !== undefined && (
          <span className="text-xs text-red-600">{errors.name.message}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Category</span>
          <select {...register("category")} className={FIELD}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Condition</span>
          <select {...register("condition")} className={FIELD}>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {CONDITION_LABELS[condition]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showAvailability && (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Availability</span>
          <select {...register("status")} className={FIELD}>
            <option value="available">Available to lend</option>
            <option value="unavailable">Paused — not lending right now</option>
          </select>
        </label>
      )}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Description</span>
        <textarea
          {...register("description")}
          aria-invalid={errors.description !== undefined}
          rows={3}
          placeholder="What it is, what's included, anything a borrower should know."
          className={FIELD}
        />
        {errors.description?.message !== undefined && (
          <span className="text-xs text-red-600">{errors.description.message}</span>
        )}
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
