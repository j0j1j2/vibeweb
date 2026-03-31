FROM node:20-alpine

WORKDIR /app

# Pre-install node-sqlite3-wasm (no native deps needed)
RUN npm install node-sqlite3-wasm && rm -rf /root/.npm

# Create /data directory for DB symlinks (before switching to non-root)
RUN mkdir -p /data && chmod 777 /data

# Non-root user for security
RUN adduser -D -u 1001 runner
USER runner

COPY --chown=runner:runner entrypoint.js /usr/local/bin/entrypoint.js

ENTRYPOINT ["node", "/usr/local/bin/entrypoint.js"]
