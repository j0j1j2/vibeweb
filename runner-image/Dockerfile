FROM node:20-alpine

WORKDIR /app

# Create /data directory for DB symlinks (before switching to non-root)
RUN mkdir -p /data && chmod 777 /data

# Non-root user for security
RUN adduser -D -u 1001 runner
USER runner

COPY --chown=runner:runner entrypoint.js /usr/local/bin/entrypoint.js

ENTRYPOINT ["node", "/usr/local/bin/entrypoint.js"]
