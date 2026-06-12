import * as React from "react";

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
  ({ value, onChange, onKeyDown, ...props }, ref) => {
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
