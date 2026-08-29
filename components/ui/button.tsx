import type { ButtonHTMLAttributes } from "react";

// Console button — square/rounded-md, one neutral accent for primary actions.
// No pill shapes, no glow shadows (retheme of willder's button.tsx).
//   primary   = accent solid (the one action color in the app)
//   secondary = surface-raised solid, quiet
//   ghost     = bordered, transparent until hover
//   danger    = red text, for deny/destructive actions
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground font-medium hover:bg-accent/90",
  secondary:
    "bg-surface-raised text-foreground font-medium border border-border hover:border-border-strong",
  ghost: "border border-border text-foreground/80 hover:border-border-strong hover:text-foreground",
  danger: "text-status-blocking border border-status-blocking/30 hover:bg-status-blocking/10",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
