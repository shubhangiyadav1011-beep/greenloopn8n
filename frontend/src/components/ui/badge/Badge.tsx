import { cn } from "@/utils";

type BadgeVariant = "light" | "solid";
type BadgeSize = "sm" | "md";
type BadgeColor =
  "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

interface BadgeProps {
  variant?: BadgeVariant; // Light or solid variant
  size?: BadgeSize; // Badge size
  color?: BadgeColor; // Badge color
  startIcon?: React.ReactNode; // Icon at the start
  endIcon?: React.ReactNode; // Icon at the end
  showDot?: boolean; // Show indicator dot
  children: React.ReactNode; // Badge content
}

const DOT_COLORS: Record<BadgeColor, string> = {
  success: "bg-[#00e599]",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  info: "bg-teal-500",
  primary: "bg-emerald-600 dark:bg-[#00e599]",
  light: "bg-gray-400",
  dark: "bg-white",
};

const Badge: React.FC<BadgeProps> = ({
  variant = "light",
  color = "primary",
  size = "md",
  startIcon,
  endIcon,
  showDot = true,
  children,
}) => {
  // GreenLoop status pills with precision borders and charcoal/forest/mint tokens
  const baseStyles =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-mono font-medium uppercase tracking-[0.07em] border transition-colors";

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px] leading-tight",
    md: "px-2.5 py-0.5 text-[11px] leading-normal",
  };

  const variants = {
    light: {
      primary:
        "border-emerald-900/20 bg-[#163825]/10 text-emerald-950 dark:border-emerald-400/25 dark:bg-emerald-950/40 dark:text-emerald-300",
      success:
        "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
      error:
        "border-rose-500/25 bg-rose-500/10 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
      warning:
        "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
      info:
        "border-teal-500/25 bg-teal-500/10 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300",
      light:
        "border-gray-200 bg-gray-100 text-gray-700 dark:border-steel-800 dark:bg-white/[0.04] dark:text-gray-300",
      dark:
        "border-ink-800 bg-ink-900 text-white dark:border-white/20 dark:bg-white/10 dark:text-white",
    },
    solid: {
      primary: "border-transparent bg-ink-900 text-white dark:bg-white dark:text-ink-900",
      success: "border-transparent bg-[#1f422e] text-white",
      error: "border-transparent bg-rose-600 text-white",
      warning: "border-transparent bg-amber-600 text-white",
      info: "border-transparent bg-teal-600 text-white",
      light: "border-transparent bg-gray-400 text-white dark:bg-white/10",
      dark: "border-transparent bg-ink-800 text-white",
    },
  };

  const sizeClass = sizeStyles[size];
  const colorStyles = variants[variant][color];

  return (
    <span className={cn(baseStyles, sizeClass, colorStyles)}>
      {startIcon ? (
        <span className="me-0.5">{startIcon}</span>
      ) : showDot ? (
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT_COLORS[color])} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
      {endIcon && <span className="ms-0.5">{endIcon}</span>}
    </span>
  );
};

export default Badge;
