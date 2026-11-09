import type { LoanPhase } from "@/convex/lib/constants";

const LABELS: Record<LoanPhase, string> = {
  pending: "Waiting",
  upcoming: "Booked",
  active: "Out now",
  overdue: "Overdue",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
};

const STYLES: Record<LoanPhase, string> = {
  pending: "border-orange/25 bg-[#fff6f1] text-[#a13d1f]",
  upcoming: "border-brand/20 bg-[#eef2ff] text-brand",
  active: "border-[#cfe3ff] bg-[#eaf3ff] text-[#0b5fd9]",
  overdue: "border-red-200 bg-red-50 text-red-700",
  declined: "border-rule bg-page text-ink-muted",
  cancelled: "border-rule bg-page text-ink-muted",
  returned: "border-[#cfe9dd] bg-[#f0faf5] text-[#147a52]",
};

const DOTS: Record<LoanPhase, string> = {
  pending: "bg-orange",
  upcoming: "bg-brand",
  active: "bg-[#0373ff]",
  overdue: "bg-red-500",
  declined: "bg-ink-muted/50",
  cancelled: "bg-ink-muted/50",
  returned: "bg-[#1f9d6b]",
};

export function RequestStatusBadge({ phase }: { phase: LoanPhase }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.01em] ${STYLES[phase]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOTS[phase]}`} />
      {LABELS[phase]}
    </span>
  );
}
