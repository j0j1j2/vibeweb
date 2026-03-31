FROM node:20-alpine
RUN apk add --no-cache git && npm install -g pnpm
WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy shared package source and built dist
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/dist/ ./packages/shared/dist/

# Copy control-api package
COPY packages/control-api/package.json ./packages/control-api/package.json
COPY packages/control-api/dist/ ./packages/control-api/dist/

# Install production deps (resolves workspace:* from local copies)
RUN pnpm install --filter @vibeweb/control-api --prod --frozen-lockfile

WORKDIR /app/packages/control-api
CMD ["node", "dist/index.js"]
