FROM node:20-alpine

# Install git and AL-specific tools
RUN apk add --no-cache git curl bash

# Create working directory
WORKDIR /app

# Create directories for repositories and caching
RUN mkdir -p /app/repo-cache /app/index-cache /app/config /app/scripts

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

# Build TypeScript
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S alserver -u 1001
RUN chown -R alserver:nodejs /app
USER alserver

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Expose MCP server port
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]