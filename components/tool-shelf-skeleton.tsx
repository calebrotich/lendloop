export function ToolShelfSkeleton() {
  return (
    <ul aria-hidden="true" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="h-[4.5rem] animate-pulse rounded-xl border border-line bg-surface-raised"
        />
      ))}
    </ul>
  );
}
