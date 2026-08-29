import path from "node:path";

export default {
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      vitest: path.resolve(import.meta.dirname, "../api-server/node_modules/vitest"),
    },
  },
};