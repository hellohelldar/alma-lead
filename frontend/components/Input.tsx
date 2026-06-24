import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  id,
  className,
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-ink shadow-sm ring-1 ring-inset",
          "placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-forest",
          "transition-shadow",
          error ? "ring-red-400" : "ring-line",
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
