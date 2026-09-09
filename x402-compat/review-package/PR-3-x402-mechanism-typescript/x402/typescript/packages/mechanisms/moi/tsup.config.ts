import { defineConfig } from "tsup";

const entry = {
  index: "src/index.ts",
  "exact/client/index": "src/exact/client/index.ts",
  "exact/server/index": "src/exact/server/index.ts",
  "exact/facilitator/index": "src/exact/facilitator/index.ts",
};

export default defineConfig([
  {
    entry,
    format: ["esm"],
    outDir: "dist/esm",
    dts: { resolve: true },
    sourcemap: true,
    target: "es2020",
    clean: true,
  },
  {
    entry,
    format: ["cjs"],
    outDir: "dist/cjs",
    dts: { resolve: true },
    sourcemap: true,
    target: "es2020",
    clean: false,
  },
]);
