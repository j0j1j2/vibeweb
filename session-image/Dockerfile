FROM node:20

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Bridge server dependencies
WORKDIR /opt/bridge
RUN npm install ws

# Bridge server
COPY bridge.js /opt/bridge/bridge.js

# Create non-root user (--dangerously-skip-permissions requires non-root)
RUN useradd -m -s /bin/bash vibe && \
    mkdir -p /workspace && chown vibe:vibe /workspace

WORKDIR /workspace

EXPOSE 3100

CMD ["node", "/opt/bridge/bridge.js"]
