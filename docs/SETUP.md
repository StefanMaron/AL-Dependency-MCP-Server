# AL MCP Server Setup Guide

This guide provides comprehensive setup instructions for the AL MCP Server for browsing Business Central code dependencies.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment-Specific Setup](#environment-specific-setup)
- [Configuration](#configuration)
- [Integration](#integration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Docker**: Version 20.10 or later
- **Docker Compose**: Version 2.0 or later
- **Memory**: Minimum 2GB RAM, recommended 4GB+
- **Storage**: Minimum 5GB free space for repository caching
- **Network**: Internet access for repository cloning

### Optional Requirements

- **Git**: For local development and manual repository operations
- **Node.js**: Version 20+ if running without Docker
- **VS Code**: For AL development integration

## Quick Start

### 1. Default Setup (BC History Sandbox)

The simplest way to get started with Stefan Maron's managed BC repository:

```bash
# Clone the AL MCP Server
git clone https://github.com/username/al-mcp-server.git
cd al-mcp-server

# Start with default configuration
docker-compose up -d

# Check status
docker-compose logs -f
```

This will:
- Pull Stefan Maron's BC History Sandbox repository
- Index the w1-26 and w1-24 branches
- Start the MCP server on port 3000
- Enable automatic cleanup

### 2. Verify Installation

```bash
# Check if the server is running
curl http://localhost:3000/health

# Test MCP functionality (if you have mcp-client installed)
mcp call al_repo_status '{"detailed": true}'
```

## Environment-Specific Setup

### Local AL Development

For developing AL extensions with local workspace monitoring:

```bash
# Create docker-compose.override.yml
cat > docker-compose.override.yml << EOF
version: '3.8'
services:
  al-mcp-server:
    volumes:
      - ./my-al-workspace:/workspace:ro
      - ./BCApps-reference:/bc-reference:ro
    environment:
      - REPO_TYPE=local-development
      - WORKSPACE_PATH=/workspace
      - REFERENCE_PATH=/bc-reference
      - WATCH_FILES=true
      - LOG_LEVEL=debug
EOF

# Start with local development configuration
docker-compose up -d
```

### Enterprise BC Fork

For organizations using custom BC forks:

```bash
# Create secrets directory
mkdir -p secrets
echo "your-github-token" > secrets/git-token.txt

# Use enterprise configuration
docker-compose -f docker-compose.examples.yml --profile enterprise up -d
```

##### Multiple Repositories

Run multiple instances for different repositories:

```bash
# BC History Sandbox instance
docker-compose -f docker-compose.examples.yml up al-mcp-bc-history -d

# Local development instance  
docker-compose -f docker-compose.examples.yml --profile local up al-mcp-local -d

# Enterprise instance
docker-compose -f docker-compose.examples.yml --profile enterprise up al-mcp-enterprise -d
```

## Configuration

### Environment Variables

Create a `.env` file for custom configuration:

```bash
# Repository Configuration
REPO_TYPE=bc-history-sandbox
REPO_URL=https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git
DEFAULT_BRANCHES=w1-26,w1-25,w1-24

# Performance Settings
MAX_BRANCHES=15
AUTO_CLEANUP=true
CLEANUP_INTERVAL=24h

# Logging
LOG_LEVEL=info
VERBOSE=false

# Paths
REPO_CACHE_PATH=/app/repo-cache
INDEX_CACHE_PATH=/app/index-cache

# Local Development (if applicable)
WORKSPACE_PATH=/workspace
REFERENCE_PATH=/bc-reference
WATCH_FILES=true
SCAN_DEPTH=3
```

### Custom Configuration Files

#### BC History Sandbox Configuration

```yaml
# config/custom-bc-history.yml
repository:
  type: "bc-history-sandbox"
  url: "https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git"
  
branches:
  default: ["w1-26", "w1-25", "w1-24"]
  max_branches: 15
  auto_cleanup: true

indexing:
  include_obsolete: false
  include_details: true
  performance_mode: true

features:
  dependency_tracking: true
  code_browsing: true
```

#### Local Development Configuration

```yaml
# config/custom-local-dev.yml
repository:
  type: "local-development"
  workspace_path: "/workspace"
  
workspace:
  watch_files: true
  auto_refresh: true
  scan_depth: 3

development:
  hot_reload: true
  error_detection: true
  syntax_validation: true

features:
  dependency_tracking: true
  code_browsing: true
```

### Docker Configuration

#### Custom Dockerfile

```dockerfile
FROM al-mcp-server:base

# Add custom configuration
COPY config/custom-config.yml /app/config/

# Add custom scripts
COPY scripts/custom-init.sh /app/scripts/
RUN chmod +x /app/scripts/custom-init.sh

# Environment-specific setup
ENV CUSTOM_CONFIG_FILE=/app/config/custom-config.yml
```

#### Custom Docker Compose

```yaml
# docker-compose.custom.yml
version: '3.8'
services:
  al-mcp-server:
    build:
      context: .
      dockerfile: Dockerfile.custom
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
      - ./workspace:/workspace:ro
      - repo-cache:/app/repo-cache
      - index-cache:/app/index-cache
    environment:
      - NODE_ENV=production
      - CUSTOM_CONFIG=true
    restart: unless-stopped

volumes:
  repo-cache:
  index-cache:
```

## Integration

### Claude Desktop Configuration

Add the AL MCP Server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "al-mcp-server": {
      "command": "docker",
      "args": [
        "exec", "-i", "al-mcp-server-container",
        "node", "/app/dist/server.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### VS Code Integration

#### Extension Configuration

```json
// .vscode/settings.json
{
  "al.server.url": "http://localhost:3000",
  "al.mcp.enabled": true,
  "al.mcp.autoIndex": true,
  "al.mcp.branchTracking": ["w1-26", "w1-24"]
}
```

#### Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "AL: Publish (MCP Enhanced)",
      "type": "al",
      "request": "launch",
      "runtimeType": "OnPrem",
      "server": "http://localhost:3000",
      "serverInstance": "BC",
      "authentication": "UserPassword",
      "preLaunchTask": "al-mcp-index"
    }
  ]
}
```

### GitHub Actions Integration

```yaml
# .github/workflows/al-mcp-analysis.yml
name: AL MCP Analysis

on:
  pull_request:
    paths: ['**/*.al', '**/app.json']

jobs:
  analyze:
    runs-on: ubuntu-latest
    services:
      al-mcp-server:
        image: al-mcp-server:latest
        ports:
          - 3000:3000
        env:
          REPO_TYPE: bc-history-sandbox
          DEFAULT_BRANCHES: w1-26,w1-24
          
    steps:
      - uses: actions/checkout@v3
      
      - name: Wait for MCP Server
        run: |
          timeout 60 bash -c 'until curl -f http://localhost:3000/health; do sleep 2; done'
          
      - name: Analyze Extension
        run: |
          mcp call al_search_objects '{
            "query": "*",
            "branches": ["w1-26"]
          }'
          
      - name: Browse Dependencies
        run: |
          mcp call al_find_relationships '{
            "source_object": "Customer",
            "relationship_type": "all",
            "max_depth": 2,
            "branches": ["w1-26"]
          }'
```

## Security Setup

### Authentication

#### GitHub Token Setup

```bash
# For private repositories
mkdir -p secrets
echo "ghp_your_github_token_here" > secrets/git-token.txt
chmod 600 secrets/git-token.txt

# Update docker-compose to use secrets
docker-compose -f docker-compose.examples.yml --profile enterprise up -d
```

#### Azure DevOps Token

```bash
# For Azure DevOps repositories
echo "your_azure_devops_pat" > secrets/ado-token.txt

# Use in environment variable
export AUTH_TOKEN_FILE=/run/secrets/ado-token.txt
```

### Network Security

#### Firewall Configuration

```bash
# Allow only localhost access
sudo ufw allow from 127.0.0.1 to any port 3000

# Allow specific IP ranges for team access
sudo ufw allow from 192.168.1.0/24 to any port 3000
```

#### Reverse Proxy Setup

```nginx
# nginx configuration
server {
    listen 80;
    server_name al-mcp.your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Authentication
        auth_basic "AL MCP Server";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

## Performance Optimization

### Resource Allocation

```yaml
# docker-compose.performance.yml
version: '3.8'
services:
  al-mcp-server:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    environment:
      - MAX_BRANCHES=20
      - INDEX_BATCH_SIZE=200
      - SEARCH_CACHE_SIZE=2000
      - MEMORY_LIMIT=3GB
```

### Storage Optimization

```bash
# Use SSD storage for better performance
docker volume create --driver local --opt type=none \
  --opt o=bind --opt device=/fast-ssd/al-mcp-cache repo-cache

# Configure automatic cleanup
echo "0 2 * * * docker exec al-mcp-server /app/scripts/cleanup-branches.sh --max-branches 10" | crontab -
```

### Network Optimization

```bash
# Enable Docker BuildKit for faster builds
export DOCKER_BUILDKIT=1

# Use layer caching
docker build --cache-from al-mcp-server:latest -t al-mcp-server:latest .
```

## Monitoring and Maintenance

### Health Monitoring

```bash
#!/bin/bash
# health-monitor.sh

while true; do
    if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "$(date): AL MCP Server is down, restarting..."
        docker-compose restart
        sleep 60
    fi
    sleep 30
done
```

### Log Management

```yaml
# docker-compose.logging.yml
version: '3.8'
services:
  al-mcp-server:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
        compress: "true"
```

### Backup Strategy

```bash
#!/bin/bash
# backup-al-mcp.sh

# Backup repository cache
docker run --rm -v al-mcp-repo-cache:/data -v $(pwd):/backup \
  alpine tar czf /backup/repo-cache-$(date +%Y%m%d).tar.gz /data

# Backup index cache
docker run --rm -v al-mcp-index-cache:/data -v $(pwd):/backup \
  alpine tar czf /backup/index-cache-$(date +%Y%m%d).tar.gz /data

# Cleanup old backups (keep 7 days)
find . -name "*-cache-*.tar.gz" -mtime +7 -delete
```

## Troubleshooting

### Common Issues

#### Server Won't Start

```bash
# Check Docker logs
docker-compose logs al-mcp-server

# Check port conflicts
netstat -tulpn | grep 3000

# Verify Docker resources
docker system df
docker system prune -f
```

#### Repository Clone Failures

```bash
# Check network connectivity
curl -I https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git

# Verify authentication (if needed)
docker exec -it al-mcp-server git config --list

# Manual clone test
docker exec -it al-mcp-server /app/scripts/init-repo.sh
```

#### Performance Issues

```bash
# Check resource usage
docker stats al-mcp-server

# Review index status
mcp call al_repo_status '{"detailed": true, "include_performance": true}'

# Cleanup and rebuild indices
docker exec -it al-mcp-server /app/scripts/cleanup-branches.sh --max-branches 5
```

#### Memory Issues

```bash
# Monitor memory usage
docker exec -it al-mcp-server free -h

# Reduce cache sizes
export SEARCH_CACHE_SIZE=500
export INDEX_BATCH_SIZE=50
docker-compose restart
```

### Debug Mode

```bash
# Enable debug logging
docker-compose up -d --build \
  -e LOG_LEVEL=debug \
  -e VERBOSE=true

# Follow debug logs
docker-compose logs -f --tail=100
```

### Recovery Procedures

#### Complete Reset

```bash
# Stop services
docker-compose down

# Remove all data
docker volume rm al-mcp-repo-cache al-mcp-index-cache

# Restart fresh
docker-compose up -d --build
```

#### Partial Reset

```bash
# Clear only index cache
docker volume rm al-mcp-index-cache
docker-compose restart

# Force re-index
mcp call al_rebuild_index '{}'
```

For additional support, check the [API documentation](API.md) and [examples](EXAMPLES.md).