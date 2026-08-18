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

import { Scale, CheckCheck, Wifi, WifiOff, Activity } from "lucide-react";
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
          gap: 10,
          padding: "8px 12px",
          background: "rgba(100,116,139,.08)",
          border: "1px solid rgba(100,116,139,.15)",
          borderRadius: 10,
          marginBottom: 10,
        }}
      >
        <WifiOff size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: ".76rem", color: "#64748b", lineHeight: 1.4 }}>
          {error ?? "Balance non connectée — saisie manuelle disponible"}
        </span>
      </div>
    );
  }

  // ── Connecté — affichage calculatrice industrielle ───────────────────────
  const weightDisplay =
    weightKg !== null ? weightKg.toFixed(3) : "– – –";

  return (
    <div
      style={{
        background: "#0a0f14",
        border: `1.5px solid ${isStable ? "#16a34a" : "#1e293b"}`,
        borderRadius: 14,
        marginBottom: 10,
        overflow: "hidden",
        boxShadow: isStable
          ? "0 0 0 1px rgba(22,163,74,.2), 0 4px 16px rgba(0,0,0,.4)"
          : "0 4px 16px rgba(0,0,0,.3)",
        transition: "border-color .3s, box-shadow .3s",
      }}
    >
      {/* ── Barre de statut ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          background: "rgba(255,255,255,.04)",
          borderBottom: "1px solid rgba(255,255,255,.06)",
        }}
      >
        <Scale size={13} color="#4ade80" />
        <span
          style={{
            fontSize: ".65rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "#4ade80",
            flex: 1,
          }}
        >
          Balance RS-232
        </span>

        {/* Indicateur stable / en cours */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {isStable ? (
            <>
              <span
                style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#4ade80",
                  boxShadow: "0 0 0 2px rgba(74,222,128,.25)",
                }}
              />
              <span style={{ fontSize: ".65rem", color: "#4ade80", fontWeight: 700 }}>
                STABLE
              </span>
            </>
          ) : (
            <>
              <Activity
                size={13}
                color="#f59e0b"
                style={{ animation: "t-pulse 1.2s ease-in-out infinite" }}
              />
              <span
                style={{
                  fontSize: ".65rem", color: "#f59e0b", fontWeight: 700,
                  animation: "t-pulse 1.2s ease-in-out infinite",
                }}
              >
                STABILISATION…
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Affichage poids ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "14px 16px",
        }}
      >
        {/* Valeur numérique — style LCD */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Courier New', 'Lucida Console', monospace",
              fontSize: "2.4rem",
              fontWeight: 900,
              letterSpacing: "-.01em",
              color: isStable ? "#4ade80" : "#475569",
              lineHeight: 1,
              textShadow: isStable
                ? "0 0 12px rgba(74,222,128,.4)"
                : "none",
              transition: "color .3s, text-shadow .3s",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {weightDisplay}
          </div>
          <div
            style={{
              fontSize: ".72rem",
              fontWeight: 600,
              color: "#475569",
              marginTop: 3,
              letterSpacing: ".04em",
            }}
          >
            kilogrammes
          </div>
        </div>

        {/* Bouton utiliser */}
        <button
          disabled={!isStable || weightKg === null}
          onClick={() => weightKg !== null && onUse(weightKg)}
          style={{
            flexShrink: 0,
            background: isStable
              ? "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)"
              : "#1e293b",
            color: isStable ? "#fff" : "#334155",
            border: "none",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: ".78rem",
            fontWeight: 700,
            cursor: isStable ? "pointer" : "not-allowed",
            transition: "background .25s, color .25s, box-shadow .25s",
            boxShadow: isStable ? "0 2px 12px rgba(22,163,74,.4)" : "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            lineHeight: 1.2,
            minWidth: 72,
          }}
        >
          <CheckCheck size={18} strokeWidth={isStable ? 2.5 : 2} />
          <span style={{ whiteSpace: "nowrap" }}>
            Utiliser<br />ce poids
          </span>
        </button>
      </div>

      {/* ── Connexion OK — indicateur bas ───────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px 8px",
        }}
      >
        <Wifi size={11} color="#1d4ed8" />
        <span style={{ fontSize: ".62rem", color: "#1d4ed8", fontWeight: 600 }}>
          Connectée sur port 8765
        </span>
      </div>
    </div>
  );
}
