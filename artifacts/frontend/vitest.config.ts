import path from "node:path";
import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      vitest: path.resolve(import.meta.dirname, "../api-server/node_modules/vitest"),
    },
  },
};