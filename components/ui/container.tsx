import type { ReactNode } from "react";

export const CONTAINER = "mx-auto w-full max-w-[1280px] px-5 sm:px-8";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${CONTAINER} ${className}`}>{children}</div>;
}
