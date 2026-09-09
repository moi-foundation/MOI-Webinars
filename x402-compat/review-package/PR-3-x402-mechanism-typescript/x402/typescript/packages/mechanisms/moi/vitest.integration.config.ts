import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integrations/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
