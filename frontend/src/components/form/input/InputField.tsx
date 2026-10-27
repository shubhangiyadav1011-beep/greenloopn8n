import type React from "react";
import type { FC } from "react";

interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "success" | "error" | "hint" | "step"
> {
  success?: boolean;
  error?: boolean;
  hint?: string;
  step?: number;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  defaultValue,
  value,
  onChange,
  className = "",
  min,
  max,
  step,
  disabled = false,
  success = false,
  error = false,
  hint,
  ...props
}) => {
  let inputClasses = ` h-11 w-full rounded-sm border appearance-none ps-4 pe-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-dark dark:text-white/90 dark:placeholder:text-white/30 ${className}`;

  if (disabled) {
    inputClasses += ` text-gray-500 border-gray-300 opacity-40 bg-gray-100 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 opacity-40`;
  } else if (error) {
    inputClasses += `  border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:text-error-400 dark:border-error-500 dark:focus:border-error-800`;
  } else if (success) {
    inputClasses += `  border-loop-500 focus:border-loop-300 focus:ring-loop-500/20 dark:text-loop-300 dark:border-loop-500 dark:focus:border-loop-700`;
  } else {
    inputClasses += ` bg-transparent text-ink-900 border-steel-300 focus:border-steel-400 focus:ring-ink-900/10 dark:border-steel-700 dark:text-white/90 dark:focus:border-steel-500`;
  }

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={inputClasses}
        {...props}
      />

      {hint && (
        <p
          className={`mt-1.5 text-xs ${
            error
              ? "text-error-500"
              : success
                ? "text-loop-700 dark:text-loop-300"
                : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
