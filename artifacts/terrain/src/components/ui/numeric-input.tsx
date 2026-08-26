import * as React from "react";

interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string | number;
  onChange: (rawValue: string) => void;
  /** Autorise les fractions (virgule ou point décimal). */
  decimal?: boolean;
}

function formatNumeric(value: string | number, decimal: boolean): string {
  let raw = sanitize(String(value ?? "").replace(/\s/g, "").replace(",", "."), decimal);
  if (!raw) return "";
  const negative = raw.startsWith("-");
  if (negative) raw = raw.slice(1);
  const hasDecimal = decimal && raw.includes(".");
  const [integer = "", fraction] = raw.split(".");
  const formattedInteger = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return `${negative ? "-" : ""}${formattedInteger}${hasDecimal ? `,${fraction ?? ""}` : ""}`;
}

function sanitize(value: string, decimal: boolean): string {
  if (!decimal) return value.replace(/\D/g, "");
  const sign = value.startsWith("-") ? "-" : "";
  const cleaned = value.replace(/[^0-9.]/g, "");
  const separator = cleaned.indexOf(".");
  if (separator < 0) return sign + cleaned;
  return sign + cleaned.slice(0, separator) + "." + cleaned.slice(separator + 1).replace(/\./g, "");
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, decimal = true, onKeyDown, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.replace(/\u202f/g, "").replace(/\s/g, "").replace(",", ".");
      onChange(sanitize(raw, decimal));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      const separator = event.key === "," || event.key === ".";
      if (
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        event.key.length === 1 &&
        !/[0-9]/.test(event.key) &&
        !(decimal && separator)
      ) event.preventDefault();
      onKeyDown?.(event);
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={formatNumeric(value, decimal)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";

export { NumericInput };