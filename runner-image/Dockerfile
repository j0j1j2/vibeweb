FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Pre-install better-sqlite3 so tenant functions can use it
RUN npm install better-sqlite3@11 && rm -rf /root/.npm

# Non-root user for security
RUN adduser -D -u 1001 runner
USER runner

COPY --chown=runner:runner entrypoint.js /usr/local/bin/entrypoint.js

ENTRYPOINT ["node", "/usr/local/bin/entrypoint.js"]
