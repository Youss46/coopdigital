import path from "node:path";
import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      vitest: path.resolve(import.meta.dirname, "../api-server/node_modules/vitest"),
    },
  },
};