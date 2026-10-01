import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Règles d'architecture FacturDZ, imposées par le lint plutôt que par convention :
 * 1. `process.env` n'est lu que dans src/server/env.ts et src/server/logger.ts
 *    (exception : NEXT_PUBLIC_*, publiques par définition).
 * 2. Les SDK IA ne sont importés que dans src/server/ai/providers.
 * 3. Le client Prisma généré n'est importé que dans src/server/db.
 * 4. Les services d'administration plateforme (cross-tenant) ne sont importés que depuis
 *    src/app/admin et src/server/admin (et src/components/admin pour les types).
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']:not([property.name=/^NEXT_PUBLIC_/])",
          message: "Lire les variables d'environnement via serverEnv() (src/server/env.ts).",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["openai", "openai/*", "@google/genai", "@google/genai/*"],
              message: "Les SDK IA ne s'utilisent que dans src/server/ai/providers.",
            },
            {
              group: ["@/server/admin/*", "**/server/admin/*"],
              message: "L'administration plateforme ne s'importe que depuis src/app/admin.",
            },
            {
              group: ["@/generated/prisma", "@/generated/prisma/*"],
              message: "Le client Prisma ne s'utilise que dans src/server/db.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/env.ts", "src/server/logger.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["src/server/ai/providers/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/app/admin/**", "src/server/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma", "@/generated/prisma/*"],
              message: "Le client Prisma ne s'utilise que dans src/server/db.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/db/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
