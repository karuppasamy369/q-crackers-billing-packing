import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      // `server-only` / `client-only` are build-time guards that throw when
      // imported in the wrong environment. Stub them out for tests.
      { find: /^server-only$/, replacement: stub },
      { find: /^client-only$/, replacement: stub },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
    },
  },
});
