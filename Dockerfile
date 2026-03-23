FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY packages/shared packages/shared
COPY packages/server packages/server

RUN pnpm --filter @muvat/shared build \
  && pnpm --filter @muvat/server build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --frozen-lockfile --prod --filter @muvat/server...

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 8080

CMD ["node", "packages/server/dist/index.js"]
