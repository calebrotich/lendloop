import type { Category } from "@/convex/lib/constants";
import { ToolImage } from "@/components/tool-image";
import { CATEGORY_LABELS } from "@/lib/options";

export interface ToolCardProps {
  name: string;
  category: Category;
  images: {
    imageCount: number;
    cover: { url: string; width: number; height: number } | null;
  };
}

export function ToolCard({ name, category, images }: ToolCardProps) {
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface-raised">
      <ToolImage
        src={images.cover?.url ?? null}
        alt={name}
        width={images.cover?.width}
        height={images.cover?.height}
        className="aspect-[4/3] w-full object-cover"
      />
      <div className="flex flex-col gap-1.5 px-4 py-3.5">
        <span className="text-sm font-medium tracking-tight">{name}</span>
        <span className="text-xs text-ink-muted">{CATEGORY_LABELS[category]}</span>
      </div>
    </li>
  );
}
