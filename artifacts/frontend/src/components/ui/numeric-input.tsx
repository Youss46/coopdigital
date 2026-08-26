import * as React from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string | number;
  onChange: (rawValue: string) => void;
  /** Autorise les fractions (virgule ou point décimal). */
  decimal?: boolean;
}

function normalize(raw: string, decimal: boolean): string {
  const value = decimal
    ? raw.replace(/,/g, ".").replace(/[^\d.]/g, "")
    : raw.replace(/\D/g, "");
  const separator = value.indexOf(".");
  if (separator < 0) return value;
  return value.slice(0, separator + 1) + value.slice(separator + 1).replace(/\./g, "");
}

function formatNumeric(raw: string | number, decimal: boolean): string {
  const value = normalize(String(raw), decimal);
  if (!value) return "";
  const [integer, decimals] = value.split(".");
  const formattedInteger = Number(integer || "0").toLocaleString("fr-FR");
  return decimal && decimals !== undefined ? `${formattedInteger},${decimals}` : formattedInteger;
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, onChange, decimal = true, onKeyDown, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(normalize(event.target.value, decimal));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      const separator = event.key === "," || event.key === ".";
      if (
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        event.key.length === 1 &&
        !/[0-9]/.test(event.key) &&
        !(decimal && separator)
      ) {
        event.preventDefault();
      }
      onKeyDown?.(event);
    };

    return (
      <input
        {...props}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        value={formatNumeric(value, decimal)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={ref}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };