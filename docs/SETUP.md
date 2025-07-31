# AL MCP Server Setup Guide

## Overview

The AL MCP Server provides Model Context Protocol (MCP) integration for AI assistants to browse and analyze Microsoft Dynamics 365 Business Central source code. This guide covers integration with Claude Desktop and GitHub Copilot for VS Code.

## Prerequisites

- Docker and Docker Compose installed
- Git installed
- One of the following AI assistants:
  - Claude Desktop
  - GitHub Copilot for VS Code (with MCP support)

## Quick Start

### 1. Build the Docker Image

```bash
cd /path/to/AlDependencyMCP
docker build -t aldependencymcp-al-mcp-server .
```

### 2. Test the Server

```bash
# Test that the server starts correctly
docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

## Claude Desktop Integration

### Method 1: Direct Docker Image (Recommended)

This method uses the pre-built Docker image with built-in environment variables:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

#### With Custom Configuration:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -e DEFAULT_BRANCH=w1-25 \
  -e CLONE_DEPTH=5 \
  -e MAX_BRANCHES=15 \
  -e LOG_LEVEL=debug \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Method 2: Docker Compose

```bash
claude mcp add al-mcp-server -s user -- docker-compose -f /path/to/AlDependencyMCP/docker-compose.yml run --rm al-mcp-server
```

### Method 3: Environment File

1. **Create environment file:**
```bash
cat > /path/to/AlDependencyMCP/mcp.env << EOF
NODE_ENV=production
REPO_TYPE=bc-history-sandbox
REPO_URL=https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git
DEFAULT_BRANCH=w1-26
CLONE_DEPTH=1
AUTO_CLEANUP=true
CLEANUP_INTERVAL=24h
MAX_BRANCHES=10
LOG_LEVEL=info
EOF
```

2. **Add to Claude:**
```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver --env-file /path/to/AlDependencyMCP/mcp.env aldependencymcp-al-mcp-server node dist/server.js
```

## GitHub Copilot for VS Code Integration

### Method 1: Direct Docker Image

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "al-mcp-server": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--user", "alserver",
        "aldependencymcp-al-mcp-server", "node", "dist/server.js"
      ],
      "env": {
        "DEFAULT_BRANCH": "w1-26",
        "CLONE_DEPTH": "1",
        "MAX_BRANCHES": "10",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Method 2: Docker Compose

```json
{
  "mcp.servers": {
    "al-mcp-server": {
      "command": "docker-compose",
      "args": [
        "-f", "/path/to/AlDependencyMCP/docker-compose.yml",
        "run", "--rm", "al-mcp-server"
      ],
      "cwd": "/path/to/AlDependencyMCP"
    }
  }
}
```

### Method 3: Local Node.js Installation

For development or when Docker is not available:

1. **Install and build:**
```bash
cd /path/to/AlDependencyMCP
npm install
npm run build
```

2. **Add to VS Code settings.json:**
```json
{
  "mcp.servers": {
    "al-mcp-server": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/AlDependencyMCP",
      "env": {
        "NODE_ENV": "production",
        "REPO_TYPE": "bc-history-sandbox",
        "REPO_URL": "https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git",
        "DEFAULT_BRANCH": "w1-26",
        "CLONE_DEPTH": "1",
        "AUTO_CLEANUP": "true",
        "CLEANUP_INTERVAL": "24h",
        "MAX_BRANCHES": "10",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Node.js environment | `production` | No |
| `REPO_TYPE` | Repository type | `bc-history-sandbox` | No |
| `REPO_URL` | Git repository URL | BC Sandbox History | No |
| `DEFAULT_BRANCH` | Initial branch to load | `w1-26` | No |
| `CLONE_DEPTH` | Git clone depth | `1` | No |
| `AUTO_CLEANUP` | Enable automatic cleanup | `true` | No |
| `CLEANUP_INTERVAL` | Cleanup frequency | `24h` | No |
| `MAX_BRANCHES` | Maximum branches to cache | `10` | No |
| `LOG_LEVEL` | Logging verbosity | `info` | No |
| `REPO_CACHE_PATH` | Local cache directory | `/app/.cache/repo-cache` | No |

### Repository Types

- **`bc-history-sandbox`**: Microsoft BC source code history (default)
- **`bc-fork`**: Enterprise BC fork repository
- **`al-extension`**: AL extension repository
- **`local-development`**: Local AL workspace

### Branch Configuration

The `DEFAULT_BRANCH` can be set to any valid branch name:
- BC version branches: `w1-26`, `w1-25`, `w1-24`, etc.
- Standard branches: `main`, `master`, `develop`
- Custom branches: `feature/my-feature`, `release/v2.0`

### Custom Repository Configuration

#### For Enterprise BC Forks:
```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-fork \
  -e REPO_URL=https://github.com/your-company/BCApps.git \
  -e DEFAULT_BRANCH=main \
  -e CLONE_DEPTH=5 \
  aldependencymcp-al-mcp-server node dist/server.js
```

#### For Local Development:
```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -v /path/to/your/AL/workspace:/workspace:ro \
  -e REPO_TYPE=local-development \
  -e WORKSPACE_PATH=/workspace \
  aldependencymcp-al-mcp-server node dist/server.js
```

## Troubleshooting

### Common Issues

#### 1. Environment Variables Not Loaded

**Symptoms:**
- Logs show `"allEnvKeys":[]`
- Default branch not initialized
- Server uses only default configuration

**Solution:**
Ensure you're using one of the documented methods that properly sets environment variables. The built-in Dockerfile now includes default ENV values, so this should work:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

#### 2. Docker Image Not Found

**Symptoms:**
- `docker: Error response from daemon: pull access denied`
- `Unable to find image 'aldependencymcp-al-mcp-server:latest'`

**Solution:**
```bash
cd /path/to/AlDependencyMCP
docker build -t aldependencymcp-al-mcp-server .
```

#### 3. Permission Issues

**Symptoms:**
- Permission denied errors in logs
- Cannot create cache directories

**Solution:**
Ensure you're using the correct user:
```bash
docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

#### 4. Git Repository Access Issues

**Symptoms:**
- Clone failed errors
- Network connectivity errors

**Solutions:**
- Check internet connectivity
- For private repositories, add authentication:
```bash
-e AUTH_TOKEN_FILE=/path/to/token
-v /path/to/token:/path/to/token:ro
```

#### 5. Memory/Performance Issues

**Symptoms:**
- Slow response times
- Out of memory errors

**Solutions:**
- Reduce clone depth: `-e CLONE_DEPTH=1`
- Limit max branches: `-e MAX_BRANCHES=5`
- Enable cleanup: `-e AUTO_CLEANUP=true`

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -e LOG_LEVEL=debug \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Verifying Installation

1. **Check if server starts:**
```bash
docker run --rm aldependencymcp-al-mcp-server node dist/server.js --version
```

2. **Test environment variables:**
```bash
docker run --rm aldependencymcp-al-mcp-server printenv | grep -E "(DEFAULT|BRANCH|REPO)"
```

3. **Check tools are available:**
Ask your AI assistant: "What AL MCP tools are available?"

## Performance Optimization

### Recommended Settings

For optimal performance, use these environment variables:

```bash
# Fast startup, minimal resource usage
-e CLONE_DEPTH=1
-e MAX_BRANCHES=10
-e AUTO_CLEANUP=true
-e CLEANUP_INTERVAL=24h

# For development/testing
-e CLONE_DEPTH=5
-e MAX_BRANCHES=5
-e AUTO_CLEANUP=true
-e LOG_LEVEL=debug
```

### Resource Usage

| Configuration | Memory | Storage | Startup Time |
|---------------|--------|---------|--------------|
| Single branch (depth=1) | ~128MB | ~50MB | ~30s |
| 5 branches (depth=1) | ~256MB | ~250MB | ~2min |
| 10 branches (depth=5) | ~512MB | ~500MB | ~5min |

## Security Considerations

### Container Security

The Docker container runs as a non-root user (`alserver`) for security:
- No sudo access
- Limited system permissions
- Read-only repository access

### Network Security

- Only outbound HTTPS connections to Git repositories
- No inbound network access required
- Rate limiting on Git operations

### Data Privacy

- Repository content is cached locally in container
- No data sent to external services
- Containers are ephemeral (`--rm` flag)

## Updates and Maintenance

### Updating the Server

1. **Pull latest code:**
```bash
cd /path/to/AlDependencyMCP
git pull origin main
```

2. **Rebuild image:**
```bash
docker build -t aldependencymcp-al-mcp-server .
```

3. **Update Claude configuration:**
```bash
claude mcp remove al-mcp-server
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

### Cleanup

Remove old Docker images and volumes:
```bash
docker system prune -f
docker volume prune -f
```

## Advanced Configuration

### Multiple Repository Setup

You can configure multiple MCP servers for different repositories:

```bash
# BC History Sandbox
claude mcp add al-bc-history -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-history-sandbox \
  -e DEFAULT_BRANCH=w1-26 \
  aldependencymcp-al-mcp-server node dist/server.js

# Enterprise Fork
claude mcp add al-enterprise -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-fork \
  -e REPO_URL=https://github.com/your-company/BCApps.git \
  -e DEFAULT_BRANCH=main \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Custom Docker Build

For custom configurations, modify the Dockerfile environment variables:

```dockerfile
# Custom defaults
ENV DEFAULT_BRANCH=w1-25
ENV MAX_BRANCHES=15
ENV CLONE_DEPTH=3
ENV LOG_LEVEL=debug
```

Then rebuild:
```bash
docker build -t my-custom-al-mcp-server .
```

## Support and Troubleshooting

### Getting Help

1. **Check logs:** Use `LOG_LEVEL=debug` for detailed output
2. **GitHub Issues:** Report bugs and feature requests
3. **Documentation:** Review `/docs` directory for additional guides

### Common Workflows

#### First-time Setup:
1. Clone repository
2. Build Docker image
3. Add to Claude/VS Code
4. Test with a simple query

#### Daily Usage:
1. Ask about BC objects: "Find all Sales codeunits"
2. Explore dependencies: "Show dependencies for Customer table"
3. Browse versions: "Compare w1-26 vs w1-25 for Item table"

#### Troubleshooting:
1. Enable debug logging
2. Check environment variables
3. Verify Docker image exists
4. Test network connectivity

For additional examples and use cases, see [EXAMPLES.md](EXAMPLES.md).

4. **Test the MCP server:**
   ```bash
   # Test manually first
   echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | \
     docker run --rm -i aldependencymcp-al-mcp-server node dist/server.js
   
   # Then test with Claude Code
   claude /mcp
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
DEFAULT_BRANCH=w1-26,w1-25,w1-24

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
          DEFAULT_BRANCH: w1-26,w1-24
          
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