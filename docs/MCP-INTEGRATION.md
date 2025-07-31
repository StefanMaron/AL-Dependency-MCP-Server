# MCP Integration Guide

This guide provides detailed instructions for integrating the AL MCP Server with various AI assistants that support the Model Context Protocol (MCP).

## Overview

The AL MCP Server provides AI assistants with the ability to:
- Browse Microsoft Dynamics 365 Business Central source code
- Search for AL objects (tables, pages, codeunits, etc.)
- Analyze dependencies and relationships
- Compare different BC versions
- Explore local AL workspaces

## Supported AI Assistants

- **Claude Desktop** - Full support with `claude mcp` command
- **GitHub Copilot for VS Code** - Via MCP extension or settings configuration
- **Any MCP-compatible client** - Via stdio protocol

## Quick Start

### 1. Build the Docker Image

```bash
cd /path/to/AlDependencyMCP
docker build -t aldependencymcp-al-mcp-server .
```

### 2. Verify the Build

```bash
# Test that the server starts and shows environment variables
docker run --rm aldependencymcp-al-mcp-server printenv | grep -E "(DEFAULT|BRANCH|REPO)"
```

Expected output:
```
DEFAULT_BRANCH=w1-26
REPO_TYPE=bc-history-sandbox
REPO_URL=https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git
```

## Claude Desktop Integration

### Method 1: Simple Docker Run (Recommended)

This method uses the Docker image with built-in environment variables:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

### Method 2: Custom Environment Variables

Override default settings:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -e DEFAULT_BRANCH=w1-25 \
  -e CLONE_DEPTH=5 \
  -e MAX_BRANCHES=15 \
  -e LOG_LEVEL=debug \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Method 3: Environment File

Create a reusable environment file:

```bash
# Create mcp.env
cat > /path/to/mcp.env << EOF
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

# Use with Claude
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver --env-file /path/to/mcp.env aldependencymcp-al-mcp-server node dist/server.js
```

### Method 4: Docker Compose

Use the existing docker-compose.yml:

```bash
claude mcp add al-mcp-server -s user -- docker-compose -f /path/to/AlDependencyMCP/docker-compose.yml run --rm al-mcp-server
```

## GitHub Copilot for VS Code Integration

### Prerequisites

- VS Code with GitHub Copilot extension
- MCP support in VS Code (via extension or built-in)

### Method 1: VS Code Settings (Recommended)

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

### Method 2: Docker Compose with VS Code

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

### Method 3: Local Node.js (Development)

For development or when Docker is not available:

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

## Repository-Specific Configurations

### Microsoft BC History Sandbox (Default)

```bash
claude mcp add al-bc-history -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-history-sandbox \
  -e DEFAULT_BRANCH=w1-26 \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Enterprise BC Fork

```bash
claude mcp add al-enterprise -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-fork \
  -e REPO_URL=https://github.com/your-company/BCApps.git \
  -e DEFAULT_BRANCH=main \
  -e AUTH_TOKEN_FILE=/path/to/token \
  -v /path/to/token:/path/to/token:ro \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Local AL Workspace

```bash
claude mcp add al-local -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=local-development \
  -e WORKSPACE_PATH=/workspace \
  -v /path/to/your/AL/project:/workspace:ro \
  aldependencymcp-al-mcp-server node dist/server.js
```

## Configuration Reference

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `REPO_TYPE` | Repository type | `bc-history-sandbox` | `bc-fork`, `local-development` |
| `REPO_URL` | Git repository URL | BC Sandbox | `https://github.com/user/repo.git` |
| `DEFAULT_BRANCH` | Initial branch | `w1-26` | `main`, `w1-25`, `develop` |
| `CLONE_DEPTH` | Git clone depth | `1` | `5`, `10` |
| `MAX_BRANCHES` | Max cached branches | `10` | `5`, `20` |
| `AUTO_CLEANUP` | Enable cleanup | `true` | `false` |
| `CLEANUP_INTERVAL` | Cleanup frequency | `24h` | `1h`, `7d` |
| `LOG_LEVEL` | Logging level | `info` | `debug`, `warn` |

### Repository Types

- **`bc-history-sandbox`**: Microsoft BC source code history
- **`bc-fork`**: Enterprise BC fork repository  
- **`al-extension`**: AL extension repository
- **`local-development`**: Local AL workspace

## Validation and Testing

### 1. Test Docker Image

```bash
# Verify image exists
docker images | grep aldependencymcp-al-mcp-server

# Test startup
docker run --rm aldependencymcp-al-mcp-server node dist/server.js --help
```

### 2. Test Environment Variables

```bash
# Check environment variables are set
docker run --rm aldependencymcp-al-mcp-server printenv | grep -E "(DEFAULT|BRANCH|REPO)"
```

### 3. Test MCP Integration

Ask your AI assistant:
- "What AL MCP tools are available?"
- "Search for Sales codeunits in BC"
- "Show me the Customer table structure"

### 4. Test Repository Access

Check logs for successful repository cloning:
```bash
# Enable debug logging
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver \
  -e LOG_LEVEL=debug \
  aldependencymcp-al-mcp-server node dist/server.js
```

Look for:
- "Repository cloned successfully"
- "Successfully initialized default branch: w1-26"
- "AL MCP Server initialized successfully"

## Troubleshooting

### Common Issues

1. **Environment variables not loaded**
   - Symptom: Logs show `"allEnvKeys":[]`
   - Solution: Use one of the documented integration methods

2. **Docker image not found**
   - Symptom: `Unable to find image`
   - Solution: Run `docker build -t aldependencymcp-al-mcp-server .`

3. **Permission denied**
   - Symptom: Permission errors in logs
   - Solution: Ensure `--user alserver` is included

4. **Network issues**
   - Symptom: Clone failed, network errors
   - Solution: Check internet connectivity and firewall

### Debug Mode

Enable detailed logging:
```bash
-e LOG_LEVEL=debug
```

### Log Analysis

Key log messages to look for:
- ✅ `Environment variables check` - Should show loaded variables
- ✅ `Repository cloned successfully` - Git operation worked
- ✅ `Successfully initialized default branch` - Branch loaded
- ✅ `AL MCP Server initialized successfully` - Server ready

## Best Practices

### Performance

- Use `CLONE_DEPTH=1` for faster startup
- Limit `MAX_BRANCHES` for memory efficiency
- Enable `AUTO_CLEANUP=true` for maintenance

### Security

- Use `--user alserver` for non-root execution
- Use `--rm` flag for ephemeral containers
- Mount volumes as read-only when possible

### Maintenance

- Regularly update the Docker image
- Monitor resource usage
- Clean up old Docker images and volumes

## Advanced Usage

### Multiple Repository Setup

Configure different servers for different purposes:

```bash
# BC History for browsing standard objects
claude mcp add al-bc-standard -s user -- docker run --rm -i --user alserver \
  -e DEFAULT_BRANCH=w1-26 \
  aldependencymcp-al-mcp-server node dist/server.js

# Enterprise fork for custom objects  
claude mcp add al-enterprise -s user -- docker run --rm -i --user alserver \
  -e REPO_TYPE=bc-fork \
  -e REPO_URL=https://github.com/company/BCApps.git \
  aldependencymcp-al-mcp-server node dist/server.js
```

### Custom Docker Images

Create specialized images for different environments:

```dockerfile
FROM aldependencymcp-al-mcp-server:latest

# Override defaults for specific use case
ENV DEFAULT_BRANCH=w1-25
ENV MAX_BRANCHES=5
ENV LOG_LEVEL=debug
```

Build and use:
```bash
docker build -t my-custom-al-mcp .
claude mcp add al-custom -s user -- docker run --rm -i --user alserver my-custom-al-mcp node dist/server.js
```

## Support

For additional help:
- Check the [SETUP.md](SETUP.md) guide
- Review [EXAMPLES.md](EXAMPLES.md) for usage examples
- Report issues on GitHub
- Enable debug logging for troubleshooting
