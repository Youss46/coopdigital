import { useEffect, useState } from "react";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}`;

export default function SystemBanner() {
  const [banner, setBanner] = useState<{ actif: boolean; message: string | null } | null>(null);

  async function fetchBanner() {
    try {
      const r = await fetch(`${API_BASE}/api/system/banner`);
      if (r.ok) setBanner(await r.json() as { actif: boolean; message: string | null });
    } catch {}
  }

  useEffect(() => {
    void fetchBanner();
    const id = setInterval(() => { void fetchBanner(); }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!banner?.actif || !banner.message) return null;

  return (
    <div
      style={{
        background: "#dc2626",
        color: "#fff",
        padding: "10px 16px",
        fontSize: "14px",
        fontWeight: 500,
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        zIndex: 9999,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: "1px" }}>⚠️</span>
      <span>{banner.message}</span>
    </div>
  );
}
