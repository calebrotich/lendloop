"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, Wallet } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { LIMITS } from "@/convex/lib/limits";
import {
  PRICING,
  ratePercentOfValue,
  suggestedDailyRateCents,
  suggestedRateRangeCents,
} from "@/convex/lib/pricing";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { appErrorMessage } from "@/lib/convex-error";
import { formatMoney } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from "@/lib/options";

const money = (options: { min: number; max: number; label: string }) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${options.label}.`)
    .regex(/^\d+(\.\d{1,2})?$/, "Use a number, like 12000.")
    .refine((value) => Number(value) >= options.min, `At least ${formatMoney(options.min * 100)}.`)
    .refine((value) => Number(value) <= options.max, `At most ${formatMoney(options.max * 100)}.`);

const toolSchema = z
  .object({
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
    valueKes: money({
      min: LIMITS.minValueCents / 100,
      max: LIMITS.maxValueCents / 100,
      label: "replacement value",
    }),
    dailyRateKes: money({
      min: 0,
      max: LIMITS.maxDailyRateCents / 100,
      label: "daily rate",
    }),
  })
  .refine((values) => Number(values.dailyRateKes) <= Number(values.valueKes), {
    path: ["dailyRateKes"],
    message: "The daily rate can’t be higher than the replacement value.",
  });

export type ToolFormValues = z.infer<typeof toolSchema>;

/** What the form hands back: amounts converted to integer cents. */
export interface ToolFormPayload {
  name: string;
  category: ToolFormValues["category"];
  condition: ToolFormValues["condition"];
  description: string;
  status: ToolFormValues["status"];
  valueCents: number;
  dailyRateCents: number;
}

export interface ToolFormInitial {
  name?: string;
  category?: ToolFormValues["category"];
  condition?: ToolFormValues["condition"];
  description?: string;
  status?: ToolFormValues["status"];
  valueCents?: number;
  dailyRateCents?: number;
}

export interface ToolFormProps {
  initial?: ToolFormInitial;
  submitLabel: string;
  /** Availability is only editable after creation; a new tool starts available. */
  showAvailability?: boolean;
  onSubmit: (values: ToolFormPayload) => Promise<void>;
  onCancel: () => void;
  /** A quiet nudge below the actions, e.g. "photos come next". */
  footerNote?: string;
}

const FIELD =
  "w-full rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[13.5px] font-medium text-navy outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-ink-muted/65 focus:border-brand/50 focus:ring-4 focus:ring-brand/10";
const LABEL = "text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase";

function kesString(cents: number | undefined): string {
  if (cents === undefined || cents <= 0) return "";
  return String(cents / 100);
}

export function ToolForm({
  initial,
  submitLabel,
  showAvailability = false,
  onSubmit,
  onCancel,
  footerNote,
}: ToolFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    control,
  } = useForm<ToolFormValues>({
    resolver: zodResolver(toolSchema),
    defaultValues: {
      name: initial?.name ?? "",
      category: initial?.category ?? "power_tools",
      condition: initial?.condition ?? "good",
      description: initial?.description ?? "",
      status: initial?.status ?? "available",
      valueKes: kesString(initial?.valueCents),
      dailyRateKes:
        initial?.dailyRateCents === undefined ? "" : String(initial.dailyRateCents / 100),
    },
  });

  const valueKes = useWatch({ control, name: "valueKes" });
  const dailyRateKes = useWatch({ control, name: "dailyRateKes" });
  const valueCents = Math.round((Number(valueKes) || 0) * 100);
  const rateCents = Math.round((Number(dailyRateKes) || 0) * 100);
  const suggestionCents = suggestedDailyRateCents(valueCents);
  const range = suggestedRateRangeCents(valueCents);
  const percent = ratePercentOfValue(rateCents, valueCents);
  const hasSuggestion = valueCents >= LIMITS.minValueCents && suggestionCents > 0;

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        name: values.name,
        category: values.category,
        condition: values.condition,
        description: values.description,
        status: values.status,
        valueCents: Math.round(Number(values.valueKes) * 100),
        dailyRateCents: Math.round(Number(values.dailyRateKes) * 100),
      });
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
      className="grid gap-4 rounded-[26px] border border-rule/80 bg-white p-5 shadow-soft sm:p-6"
    >
      {errors.root?.message !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-[#f3c6bf] bg-[#fff4f2] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#a12c1c]"
        >
          {errors.root.message}
        </p>
      )}

      <label className="grid gap-1.5">
        <span className={LABEL}>Name</span>
        <input
          {...register("name")}
          aria-invalid={errors.name !== undefined}
          placeholder="Cordless drill"
          className={FIELD}
        />
        {errors.name?.message !== undefined && (
          <span className="text-[11px] text-[#a12c1c]">{errors.name.message}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className={LABEL}>Category</span>
          <select {...register("category")} className={FIELD}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className={LABEL}>Condition</span>
          <select {...register("condition")} className={FIELD}>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {CONDITION_LABELS[condition]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="rounded-2xl border border-rule/80 bg-page/55 p-4">
        <legend className="flex items-center gap-2 px-1 text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase">
          <Icon icon={Wallet} size={13} className="text-brand" />
          Pricing
        </legend>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className={LABEL}>Replacement value (USD)</span>
            <input
              {...register("valueKes")}
              inputMode="decimal"
              placeholder="120"
              aria-invalid={errors.valueKes !== undefined}
              className={`${FIELD} tabular-nums`}
            />
            {errors.valueKes?.message !== undefined && (
              <span className="text-[11px] text-[#a12c1c]">{errors.valueKes.message}</span>
            )}
          </label>

          <label className="grid gap-1.5">
            <span className={LABEL}>Daily rate (USD)</span>
            <input
              {...register("dailyRateKes")}
              inputMode="decimal"
              placeholder="4.80"
              aria-invalid={errors.dailyRateKes !== undefined}
              className={`${FIELD} tabular-nums`}
            />
            {errors.dailyRateKes?.message !== undefined && (
              <span className="text-[11px] text-[#a12c1c]">{errors.dailyRateKes.message}</span>
            )}
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-brand/10 bg-white px-3.5 py-3">
          {hasSuggestion ? (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-relaxed text-ink-muted">
                <Icon icon={Sparkles} size={13} className="text-orange" />
                <span>Suggested</span>
                <span className="font-semibold text-navy">
                  {`${formatMoney(range.min, { alwaysCents: true })}–${formatMoney(range.max, { alwaysCents: true })}`}
                </span>
                <span>
                  a day ({PRICING.minPercent}–{PRICING.maxPercent}% of value).
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setValue("dailyRateKes", String(suggestionCents / 100), {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  className="font-semibold text-brand underline decoration-brand/25 underline-offset-4 hover:decoration-brand"
                >
                  Use {formatMoney(suggestionCents)}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setValue("dailyRateKes", "0", { shouldValidate: true, shouldDirty: true })
                  }
                  className="font-medium text-ink-muted underline decoration-transparent underline-offset-4 hover:text-navy hover:decoration-rule"
                >
                  Lend it free
                </button>
              </p>
              <p className="mt-1.5 text-[11px] text-ink-muted">
                {rateCents > 0 && percent !== null ? (
                  <>
                    Your rate is{" "}
                    <span className="font-semibold text-navy">{percent.toFixed(1)}%</span> of the
                    replacement value — {formatMoney(rateCents)} for one day,{" "}
                    {formatMoney(rateCents * 3)} for three.
                  </>
                ) : rateCents === 0 && dailyRateKes !== "" ? (
                  "Free to borrow. The owner still approves every request."
                ) : (
                  "Set a rate, or lend it free — you decide."
                )}
              </p>
              {percent !== null &&
                rateCents > 0 &&
                (percent < PRICING.minPercent || percent > PRICING.maxPercent) && (
                  <p className="mt-1 text-[10.5px] font-medium text-orange-strong">
                    Outside the suggested {PRICING.minPercent}–{PRICING.maxPercent}% band — still
                    your call.
                  </p>
                )}
            </>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Replacement value sets the suggested daily rate ({PRICING.minPercent}–
              {PRICING.maxPercent}% of it) and is the amount a borrower reimburses if the item is
              lost or not returned.
            </p>
          )}
        </div>
      </fieldset>

      {showAvailability && (
        <label className="grid gap-1.5">
          <span className={LABEL}>Availability</span>
          <select {...register("status")} className={FIELD}>
            <option value="available">Available to lend</option>
            <option value="unavailable">Paused — not lending right now</option>
          </select>
        </label>
      )}

      <label className="grid gap-1.5">
        <span className={LABEL}>Description</span>
        <textarea
          {...register("description")}
          aria-invalid={errors.description !== undefined}
          rows={3}
          placeholder="What it is, what's included, anything a borrower should know."
          className={`${FIELD} resize-none leading-relaxed`}
        />
        {errors.description?.message !== undefined && (
          <span className="text-[11px] text-[#a12c1c]">{errors.description.message}</span>
        )}
      </label>

      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <Button type="submit" loading={isSubmitting} size="md">
          {isSubmitting ? "Saving" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {footerNote !== undefined && (
        <p className="rounded-xl bg-page/75 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
          {footerNote}
        </p>
      )}
    </form>
  );
}
