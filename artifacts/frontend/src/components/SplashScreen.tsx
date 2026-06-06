import { useEffect, useState } from "react";

interface Props {
  onTermine: () => void;
}

export default function SplashScreen({ onTermine }: Props) {
  const [phase, setPhase] = useState<"entree" | "stable" | "sortie">("entree");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("stable"), 50);
    const t2 = setTimeout(() => setPhase("sortie"), 1800);
    const t3 = setTimeout(() => onTermine(), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onTermine]);

  const visible = phase !== "entree";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        backgroundColor: "#1a4731",
        opacity: phase === "sortie" ? 0 : 1,
        transition: phase === "sortie" ? "opacity 0.5s ease-in-out" : "none",
        pointerEvents: phase === "sortie" ? "none" : "auto",
      }}
    >
      {/* Bloc central */}
      <div
        style={{
          transform: visible ? "scale(1) translateY(0)" : "scale(0.7) translateY(24px)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease-out",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
        }}
      >
        {/* Icône avec halo pulsant */}
        <div style={{ position: "relative", width: 96, height: 96 }}>
          {/* Halo */}
          <div
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: 32,
              backgroundColor: "rgba(255,255,255,0.1)",
              animation: "splash-pulse 2.2s ease-in-out infinite",
            }}
          />
          {/* Fond icône */}
          <div
            style={{
              position: "relative",
              width: 96,
              height: 96,
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <img
              src="/logo-512.png"
              alt="CoopDigital"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>

        {/* Texte */}
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              color: "white",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            CoopDigital
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginTop: 8,
            }}
          >
            Gestion des coopératives cacaoyères
          </p>
        </div>
      </div>

      {/* Barre de chargement en bas */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          width: 160,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease-out 0.4s",
        }}
      >
        <div
          style={{
            height: 2,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.15)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.65)",
              animation: "splash-bar 1.5s ease-in-out forwards",
              animationDelay: "0.3s",
              width: 0,
            }}
          />
        </div>
        <p
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.3)",
            fontSize: 11,
            marginTop: 10,
            letterSpacing: "0.1em",
          }}
        >
          Côte d'Ivoire
        </p>
      </div>

      <style>{`
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.7; }
          50%       { transform: scale(1.15); opacity: 0.3; }
        }
        @keyframes splash-bar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
