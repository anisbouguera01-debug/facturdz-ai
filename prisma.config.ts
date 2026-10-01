import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url: env("DATABASE_URL"),
    // Base « fantôme » utilisée par `prisma migrate dev` / `migrate diff --from-migrations`.
    // Optionnelle : seule la CI en fournit une.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
