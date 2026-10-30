// Vitest for the API (Phase 3). Runs against the real local/dev Postgres from
// .env (dev) or the CI service container (workflow provides the env vars).
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The API sources are plain ESM TypeScript with Node16-style specifiers
 * (`./foo.js` meaning `./foo.ts`). Vite resolves that natively only for
 * `node_modules`, so map relative `.js` specifiers onto their `.ts`/`.mts`
 * sources here.
 */
function jsToTsResolver() {
  return {
    name: "js-to-ts-resolver",
    resolveId(source: string, importer?: string) {
      if (source.startsWith(".") && source.endsWith(".js") && importer && !importer.includes("node_modules")) {
        const direct = source.replace(/\.js$/, ".ts");
        const resolved = path.resolve(path.dirname(importer), direct);
        if (existsSync(resolved)) return resolved;
        const mts = source.replace(/\.js$/, ".mts");
        const mtsResolved = path.resolve(path.dirname(importer), mts);
        if (existsSync(mtsResolved)) return mtsResolved;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jsToTsResolver()],
  test: {
    include: ["api/tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Serial by default: several suites exercise shared rate-limit state.
    fileParallelism: false,
    env: {
      // Public-route tests need a stable origin; the DB password/env already
      // come from process env (.env or CI).
      APP_ORIGIN: "http://localhost:5173",
    },
  },
});
