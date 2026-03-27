FROM node:20

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Pre-install better-sqlite3 for tenant functions
WORKDIR /opt/libs
RUN npm install better-sqlite3@11

# Bridge server
COPY bridge.js /opt/bridge/bridge.js

WORKDIR /workspace

EXPOSE 3100

CMD ["node", "/opt/bridge/bridge.js"]
