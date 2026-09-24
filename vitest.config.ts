import { defineConfig } from "vitest/config";

// Coverage gates the planner's geometry core (src/lib) at the spec's ≥90%
// bar. `npm test` stays fast without coverage; `npm run test:coverage` (CI)
// enforces the thresholds.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
