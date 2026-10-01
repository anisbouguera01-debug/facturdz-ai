import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout (navigateur réel) contre l'application COMPILÉE et la base de démo :
 *   pnpm build && pnpm db:reset:local && pnpm start -p 3000   # dans un autre terminal
 *   pnpm test:e2e
 * `E2E_CHROMIUM` permet d'utiliser un Chromium déjà installé (sinon : `pnpm exec playwright install chromium`).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM || undefined,
      args: ["--no-sandbox"],
    },
  },
});
