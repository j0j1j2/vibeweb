FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy shared package source and built dist
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/dist/ ./packages/shared/dist/

# Copy function-runner package
COPY packages/function-runner/package.json ./packages/function-runner/package.json
COPY packages/function-runner/dist/ ./packages/function-runner/dist/

# Install production deps (resolves workspace:* from local copies)
RUN pnpm install --filter @vibeweb/function-runner --prod --frozen-lockfile

WORKDIR /app/packages/function-runner
CMD ["node", "dist/index.js"]
