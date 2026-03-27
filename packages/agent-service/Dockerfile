FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-service/package.json packages/agent-service/

RUN pnpm install --filter @vibeweb/agent-service --prod --frozen-lockfile

COPY packages/shared/dist/ packages/shared/dist/
COPY packages/agent-service/dist/ packages/agent-service/dist/

WORKDIR /app/packages/agent-service

CMD ["node", "dist/index.js"]
