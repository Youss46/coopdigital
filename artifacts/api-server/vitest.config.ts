import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    env: {
      JWT_SECRET: "test-secret-for-tenant-isolation-tests",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "src/tests/__mocks__/@workspace/db.ts"),
      "@workspace/api-zod": path.resolve(__dirname, "src/tests/__mocks__/@workspace/api-zod.ts"),
    },
  },
});
