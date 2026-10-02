# syntax=docker/dockerfile:1
# Image de production autonome (Next.js « standalone »). Cible `migrate` : applique les migrations.
#   docker build --build-arg NEXT_PUBLIC_APP_URL=https://app.exemple.dz -t facturdz .
#   docker build --target migrate -t facturdz-migrate .
# Aucun secret n'est copié dans l'image : tout vient de l'environnement à l'exécution.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# `prisma generate` (postinstall) lit prisma.config.ts : une URL factice suffit, rien ne s'y connecte.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm install --frozen-lockfile

FROM deps AS build
# NEXT_PUBLIC_APP_URL est intégrée au build (seule variable publique).
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL NEXT_OUTPUT=standalone
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build

# Migrations Prisma : exécutées par la chaîne de déploiement AVANT de lancer la nouvelle version.
FROM deps AS migrate
COPY prisma ./prisma
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:22-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd --system --uid 1001 --create-home app
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
