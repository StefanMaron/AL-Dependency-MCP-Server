FROM node:20-alpine

# Install git and AL-specific tools
RUN apk add --no-cache git curl bash

# Create working directory
WORKDIR /app

# Create directories for repositories and caching
RUN mkdir -p /app/.cache/repo-cache /app/.cache/index-cache /app/config /app/scripts

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY debug-entrypoint.sh ./

# Build TypeScript
RUN npm run build

# Set default environment variables for MCP usage
ENV NODE_ENV=production
ENV REPO_TYPE=bc-history-sandbox
ENV REPO_URL=https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git
ENV DEFAULT_BRANCH=w1-26
ENV CLONE_DEPTH=1
ENV AUTO_CLEANUP=true
ENV CLEANUP_INTERVAL=24h
ENV MAX_BRANCHES=10
ENV LOG_LEVEL=info

# Make debug script executable
RUN chmod +x debug-entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S alserver -u 1001
RUN chown -R alserver:nodejs /app
USER alserver

# Health check for MCP server - check if process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f "node dist/server.js" || exit 1

# Start the server
CMD ["node", "dist/server.js"]