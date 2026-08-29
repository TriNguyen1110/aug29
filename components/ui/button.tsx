import type { ButtonHTMLAttributes } from "react";

// Console button — same shape/craft as willder's button.tsx (pill-shaped,
// soft colored glow on the primary CTA that intensifies on hover), recolored
// from willder's brick/gold to this app's indigo accent + status red — per
// the 2026-08-29 correction: keep the craft (glow, pill shape) wholesale,
// swap only the palette.
//   primary   = accent solid + soft indigo glow (the one action color in the app)
//   secondary = surface-raised solid, quiet
//   ghost     = bordered pill, transparent until hover
//   danger    = status-red text + faint red glow, for deny/destructive actions
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground font-medium shadow-[0_0_24px_-6px_rgba(88,101,242,0.85)] hover:bg-accent/90 hover:shadow-[0_0_30px_-4px_rgba(88,101,242,1)]",
  secondary:
    "bg-surface-raised text-foreground font-medium border border-border hover:border-border-strong",
  ghost: "border border-border text-foreground/80 hover:border-border-strong hover:text-foreground",
  danger:
    "text-status-blocking border border-status-blocking/40 shadow-[0_0_16px_-8px_rgba(239,68,68,0.55)] hover:bg-status-blocking/10 hover:shadow-[0_0_22px_-4px_rgba(239,68,68,0.85)]",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full transition-all duration-200 disabled:opacity-40 disabled:shadow-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
