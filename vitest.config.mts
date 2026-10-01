import { defineConfig } from "vitest/config";

const resolve = {
  tsconfigPaths: true,
  alias: {
    // `server-only` lève une erreur hors environnement React Server ;
    // en test on le remplace par un module vide.
    "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
  },
};

export default defineConfig({
  resolve,
  test: {
    restoreMocks: true,
    coverage: { provider: "v8", include: ["src/server/**", "src/lib/**"] },
    projects: [
      {
        resolve,
        test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        resolve,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Réinitialise et migre TEST_DATABASE_URL une fois avant la suite.
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["dotenv/config"],
          // Une seule base partagée : on exécute les fichiers en série.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
