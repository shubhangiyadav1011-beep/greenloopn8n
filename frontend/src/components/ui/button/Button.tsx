import type { MouseEventHandler, ReactNode } from "react";

interface ButtonProps {
  id?: string; // HTML ID for testing and semantics
  children: ReactNode; // Button text or content
  size?: "sm" | "md"; // Button size
  variant?: "primary" | "outline"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: MouseEventHandler<HTMLButtonElement>; // Click handler
  disabled?: boolean; // Disabled state
  className?: string; // Custom classes
  type?: "button" | "submit" | "reset"; // Button type
}

const Button: React.FC<ButtonProps> = ({
  id,
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  type = "button",
}) => {
  // Size Classes
  const sizeClasses = {
    sm: "min-h-10 px-4 py-2 text-sm",
    md: "min-h-11 px-5 py-2.5 text-sm",
  };

  // Variant Classes — GreenLoop: charcoal primary, steel outline, squared
  const variantClasses = {
    primary:
      "bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300 dark:bg-white dark:text-ink-900 dark:hover:bg-gray-200 dark:disabled:bg-ink-700 dark:disabled:text-ink-400",
    outline:
      "bg-gray-25 text-ink-800 ring-1 ring-inset ring-steel-300 hover:bg-steel-50 dark:bg-gray-dark dark:text-gray-200 dark:ring-steel-700 dark:hover:bg-white/5 dark:hover:text-white",
  };

  return (
    <button
      id={id}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-medium transition ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
