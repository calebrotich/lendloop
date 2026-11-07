import type { Category } from "@/convex/lib/constants";
import { CATEGORY_LABELS } from "@/lib/categories";

export function ToolCard({ name, category }: { name: string; category: Category }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised px-4 py-3.5">
      <span className="text-sm font-medium tracking-tight">{name}</span>
      <span className="text-xs text-ink-muted">{CATEGORY_LABELS[category]}</span>
    </li>
  );
}
