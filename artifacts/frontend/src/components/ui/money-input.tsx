import * as React from "react";
import { cn } from "@/lib/utils";

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string | number;
  onChange: (rawValue: string) => void;
}

function formatMoney(raw: string | number): string {
  const str = String(raw).replace(/\D/g, "");
  if (!str) return "";
  return parseInt(str, 10).toLocaleString("fr-FR");
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, value, onChange, onKeyDown, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "");
      onChange(raw);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        e.key.length === 1 &&
        !/[0-9]/.test(e.key)
      ) {
        e.preventDefault();
      }
      onKeyDown?.(e);
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        value={formatMoney(value)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={ref}
        {...props}
      />
    );
  }
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
