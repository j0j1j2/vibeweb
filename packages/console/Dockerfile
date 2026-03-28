FROM node:20-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/console/package.json packages/console/

RUN pnpm install --filter @vibeweb/console --frozen-lockfile

COPY packages/console/ packages/console/

WORKDIR /app/packages/console
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/packages/console/dist /usr/share/nginx/html
COPY configs/console-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
