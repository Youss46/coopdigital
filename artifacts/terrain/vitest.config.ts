import path from "node:path";

export default {
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      vitest: path.resolve(import.meta.dirname, "../api-server/node_modules/vitest"),
    },
  },
};