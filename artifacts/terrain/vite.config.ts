import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import crypto from "crypto";

// ── Embed Ed25519 public key at build time ────────────────────────────────────
// Computed from SESSION_SECRET so the station can verify QR codes without a
// network request. Empty string if secret is absent (no key pinned in bundle).
let _stationQrPublicKeySpki = "";
const _buildSecret = process.env["SESSION_SECRET"];
if (_buildSecret) {
  try {
    const PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");
    const seed = crypto.scryptSync(
      Buffer.from(_buildSecret),
      Buffer.from("station-qr-ed25519-v1"),
      32,
    );
    const der = Buffer.concat([PKCS8_HEADER, seed]);
    const priv = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const pub = crypto.createPublicKey(priv);
    _stationQrPublicKeySpki = (
      pub.export({ type: "spki", format: "der" }) as Buffer
    ).toString("base64");
  } catch {
    // Non-fatal: station will fall back to fetching the key from the API
  }
}

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3001;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.TERRAIN_BASE_PATH ?? process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  define: {
    // Public key pinned in bundle — safe to ship (it's a public key)
    __STATION_QR_PUBLIC_KEY__: JSON.stringify(_stationQrPublicKeySpki),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
