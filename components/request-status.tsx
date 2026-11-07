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
  pending: "border-line bg-surface text-ink-muted",
  upcoming: "border-accent/30 bg-accent/10 text-accent-strong",
  active: "border-accent/30 bg-accent/10 text-accent-strong",
  overdue: "border-red-200 bg-red-50 text-red-700",
  declined: "border-line bg-surface text-ink-muted",
  cancelled: "border-line bg-surface text-ink-muted",
  returned: "border-line bg-surface text-ink-muted",
};

export function RequestStatusBadge({ phase }: { phase: LoanPhase }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STYLES[phase]}`}>
      {LABELS[phase]}
    </span>
  );
}
