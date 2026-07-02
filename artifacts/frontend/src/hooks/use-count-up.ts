import { useEffect, useRef, useState } from "react";

function parseNumeric(valeur: string): { prefix: string; number: number; suffix: string; decimals: number } | null {
  const match = valeur.match(/^(\D*?)([\d\s]+(?:[.,]\d+)?)(\D*)$/);
  if (!match) return null;
  const [, prefix, rawNumber, suffix] = match;
  const normalized = rawNumber.replace(/\s/g, "").replace(",", ".");
  const number = parseFloat(normalized);
  if (Number.isNaN(number)) return null;
  const decimalMatch = normalized.match(/\.(\d+)$/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;
  return { prefix, number, suffix, decimals };
}

function formatWithThousands(n: number, decimals: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function useCountUp(valeur: string, durationMs = 900): string {
  const [display, setDisplay] = useState(valeur);
  const frameRef = useRef<number | undefined>(undefined);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setDisplay(valeur);
      return;
    }

    const parsed = parseNumeric(valeur);
    if (!parsed) {
      setDisplay(valeur);
      return;
    }

    const { prefix, number, suffix, decimals } = parsed;
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (number - from) * eased;
      setDisplay(`${prefix}${formatWithThousands(current, decimals)}${suffix}`);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(valeur);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [valeur, durationMs]);

  return display;
}
