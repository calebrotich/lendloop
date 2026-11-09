import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "navy" | "danger" | "outline" | "ghost" | "soft";
type Size = "sm" | "md" | "lg" | "icon";

const BASE =
  "btn-travel inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-55";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white [--btn-travel-color:rgb(255_255_255/0.16)] hover:bg-navy shadow-[0_8px_24px_-12px_rgb(31_41_156/0.6)]",
  accent:
    "bg-orange-strong text-white [--btn-travel-color:rgb(255_255_255/0.16)] hover:bg-[#a93814] shadow-[0_8px_24px_-12px_rgb(242_89_41/0.7)]",
  navy: "bg-navy text-white [--btn-travel-color:rgb(255_255_255/0.14)] hover:bg-brand",
  danger:
    "bg-[#b42318] text-white [--btn-travel-color:rgb(255_255_255/0.16)] hover:bg-[#8f1c12] shadow-[0_8px_24px_-12px_rgb(180_35_24/0.65)]",
  outline:
    "border border-rule bg-white text-navy [--btn-travel-color:#eef1ff] hover:border-brand/25 hover:text-brand",
  ghost: "text-navy [--btn-travel-color:#e9edfb] hover:text-brand",
  soft: "bg-mist/70 text-brand [--btn-travel-color:rgb(255_255_255/0.6)] hover:bg-mist",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-[52px] px-7 text-[15px]",
  icon: "size-10 p-0",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
    loading?: boolean;
  };

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  iconLeft,
  iconRight,
  loading = false,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
}

export type ButtonLinkProps = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children">;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  iconLeft,
  iconRight,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}

/** The circular icon control used on cards and gallery arrows. */
export function IconButton({
  variant = "outline",
  className = "",
  children,
  ...props
}: Omit<CommonProps, "size" | "iconLeft" | "iconRight" | "children"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">) {
  return (
    <button
      type="button"
      className={`${BASE} ${VARIANTS[variant]} ${SIZES.icon} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
