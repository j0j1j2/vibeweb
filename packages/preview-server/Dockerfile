FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy shared package source and built dist
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/dist/ ./packages/shared/dist/

# Copy preview-server package
COPY packages/preview-server/package.json ./packages/preview-server/package.json
COPY packages/preview-server/dist/ ./packages/preview-server/dist/

# Install production deps (resolves workspace:* from local copies)
RUN pnpm install --filter @vibeweb/preview-server --prod --frozen-lockfile

WORKDIR /app/packages/preview-server
CMD ["node", "dist/index.js"]
