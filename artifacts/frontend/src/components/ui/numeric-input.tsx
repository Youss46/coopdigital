import * as React from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string | number;
  onChange: (rawValue: string) => void;
}

function normalize(raw: string): string {
  const value = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const separator = value.indexOf(".");
  if (separator < 0) return value;
  return value.slice(0, separator + 1) + value.slice(separator + 1).replace(/\./g, "");
}

function formatNumeric(raw: string | number): string {
  const value = normalize(String(raw));
  if (!value) return "";
  const [integer, decimals] = value.split(".");
  const formattedInteger = Number(integer || "0").toLocaleString("fr-FR");
  return decimals !== undefined ? `${formattedInteger},${decimals}` : formattedInteger;
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, onKeyDown, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(normalize(event.target.value));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        event.key.length === 1 &&
        !/[0-9.,]/.test(event.key)
      ) {
        event.preventDefault();
      }
      onKeyDown?.(event);
    };

    return (
      <input
        {...props}
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        value={formatNumeric(value)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={ref}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };