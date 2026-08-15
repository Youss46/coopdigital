/**
 * ScaleWeightDisplay — Affiche le poids lu par la balance en temps réel.
 *
 * Comportement :
 *  - Si le service local n'est pas accessible : affiche "Balance non connectée"
 *    en petit et discret — le formulaire reste entièrement utilisable manuellement.
 *  - Si le poids est en cours de stabilisation : pulsation animée.
 *  - Si le poids est stable : bouton "Utiliser ce poids" activé.
 *
 * Props :
 *  onUse(weightKg: number) — appelé quand le peseur clique "Utiliser ce poids"
 */

import { useScaleWeight } from "../hooks/useScaleWeight";

interface Props {
  onUse: (weightKg: number) => void;
}

export default function ScaleWeightDisplay({ onUse }: Props) {
  const { weightKg, isStable, isConnected, error } = useScaleWeight();

  // ── Service inaccessible ─────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          background: "rgba(100,116,139,.12)",
          borderRadius: 8,
          marginBottom: 10,
          fontSize: ".75rem",
          color: "#64748b",
        }}
      >
        <span style={{ fontSize: "1rem" }}>⚖️</span>
        <span>
          {error ?? "Balance non connectée — saisie manuelle disponible"}
        </span>
      </div>
    );
  }

  // ── Connecté, en attente de lecture stable ──────────────────────────────
  const weightDisplay =
    weightKg !== null ? `${weightKg.toFixed(3)} kg` : "Lecture en cours…";

  return (
    <div
      style={{
        background: isStable
          ? "linear-gradient(135deg, #052e16 0%, #14532d 100%)"
          : "rgba(15,36,23,.7)",
        border: `1.5px solid ${isStable ? "#16a34a" : "#334155"}`,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Icône + indicateur de stabilité */}
      <div style={{ fontSize: "1.6rem", lineHeight: 1, flexShrink: 0 }}>
        ⚖️
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: ".7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".06em",
            color: isStable ? "#4ade80" : "#64748b",
            marginBottom: 2,
          }}
        >
          Balance{" "}
          {isStable ? (
            "✓ Stable"
          ) : (
            <span style={{ animation: "t-pulse 1.2s ease-in-out infinite" }}>
              Stabilisation…
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            color: isStable ? "#ffffff" : "#94a3b8",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-.02em",
          }}
        >
          {weightDisplay}
        </div>
      </div>

      {/* Bouton "Utiliser" — actif seulement si stable */}
      <button
        disabled={!isStable || weightKg === null}
        onClick={() => weightKg !== null && onUse(weightKg)}
        style={{
          flexShrink: 0,
          background: isStable ? "#16a34a" : "#1e293b",
          color: isStable ? "#fff" : "#475569",
          border: "none",
          borderRadius: 9,
          padding: "10px 14px",
          fontSize: ".78rem",
          fontWeight: 700,
          cursor: isStable ? "pointer" : "not-allowed",
          transition: "background .2s",
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        Utiliser<br />ce poids
      </button>
    </div>
  );
}
