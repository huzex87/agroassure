# The sync gateway, containerised.
#
# The image is built from the workspace root rather than the service directory,
# because the gateway depends on @agroassure/domain by source and the migration
# runner lives in db/. Both have to be in the image for a container to be able
# to bring up a database it can serve.
#
# Principle P1: this runs anywhere a container runs. Moving custody of the
# deployment to Nigeria-resident hosting is a change of registry and DNS, not a
# rewrite.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

# Manifests first, so a dependency install is cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/field-core/package.json packages/field-core/
COPY services/sync-gateway/package.json services/sync-gateway/
COPY db/package.json db/
RUN pnpm install --frozen-lockfile --filter @agroassure/sync-gateway... --filter ./db

COPY packages/ packages/
COPY services/sync-gateway/ services/sync-gateway/
COPY db/ db/
RUN pnpm --filter @agroassure/domain run build \
 && pnpm --filter @agroassure/sync-gateway run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY --from=build /app /app

# Evidence objects land here. On this demo it is container-local and therefore
# lost on redeploy; production needs the S3 bucket with object-lock, which is
# what makes "cannot be replaced after submission" a storage guarantee.
ENV EVIDENCE_STORE_DIR=/app/evidence-store
RUN mkdir -p /app/evidence-store && chown -R node:node /app/evidence-store
USER node

EXPOSE 3001

# Migrations run on boot rather than in a separate deploy step, because a
# gateway serving a schema it was not built for is worse than one that refuses
# to start. The runner is forward-only and idempotent, so a restart is a no-op.
# SEED_DEMO_DATA is opt-in and must stay that way: the seed inserts fictional
# staff, and a live deployment that quietly acquired them would be asserting
# that people exist who do not.
CMD ["sh", "-c", "node db/migrate.mjs ${SEED_DEMO_DATA:+--seed} && node services/sync-gateway/dist/main.js"]
