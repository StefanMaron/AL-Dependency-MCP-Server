# AL Dependency MCP Server

A Model Context Protocol (MCP) server for browsing Microsoft Dynamics 365 Business Central source code dependencies. This server allows AI assistants to understand and navigate BC code dependencies by providing access to BC repositories and object relationships.

## Features

- **BC Code Browsing**: Navigate Microsoft BC source code and dependencies
- **Object Discovery**: Search and explore BC objects (tables, pages, codeunits, etc.)
- **Relationship Mapping**: Understand dependencies between BC objects
- **Multi-Version Support**: Browse different BC versions (w1-26, w1-24, etc.)
- **Performance Optimized**: Shallow cloning, incremental indexing, smart caching

## Quick Start

### Option 1: BC History Sandbox Repository (Default)
```bash
docker-compose up -d
```

### Option 2: Local Development
```bash
# Browse local AL workspace
docker run -p 3000:3000 \
  -v ./MyExtension:/workspace:ro \
  -v ./BCApps:/bc-reference:ro \
  -e REPO_TYPE=local-development \
  -e WORKSPACE_PATH=/workspace \
  -e REFERENCE_PATH=/bc-reference \
  al-mcp-server:latest
```

### Option 3: Enterprise BC Fork
```bash
docker run -p 3000:3000 \
  -e REPO_URL=https://github.com/your-company/BCApps.git \
  -e REPO_TYPE=bc-fork \
  -e DEFAULT_BRANCH=main,enterprise-v2024 \
  al-mcp-server:latest
```

## MCP Tools

### Repository Management
- `al_add_branch` - Add branch to repository
- `al_remove_branch` - Remove branch from local cache
- `al_set_repository` - Initialize or switch repository
- `al_list_branches` - List available branches
- `al_repo_status` - Get repository status and health

### BC Code Browsing
- `al_search_objects` - Search BC objects by name/type
- `al_get_object` - Get detailed object information
- `al_find_relationships` - Find object dependencies
- `al_workspace_overview` - Analyze local AL workspace

## MCP Integration

This server can be integrated with AI assistants that support the Model Context Protocol (MCP), including Claude Desktop and GitHub Copilot for VS Code.

### Claude Desktop Integration

#### Option 1: Using Pre-built Docker Image (Recommended)

1. **Build the Docker image:**
```bash
cd /path/to/AlDependencyMCP
docker build -t aldependencymcp-al-mcp-server .
```

2. **Add to Claude Desktop:**
```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
```

3. **Override environment variables (optional):**
```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver 
  -e DEFAULT_BRANCH=w1-25 
  -e CLONE_DEPTH=5 
  -e MAX_BRANCHES=15 
  aldependencymcp-al-mcp-server node dist/server.js
```

#### Option 2: Using Docker Compose

1. **Add to Claude Desktop with docker-compose:**
```bash
claude mcp add al-mcp-server -s user -- docker-compose -f /path/to/AlDependencyMCP/docker-compose.yml run --rm al-mcp-server
```

2. **Alternative: Use environment file:**
```bash
# Create environment file
cat > mcp.env << EOF
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

# Add to Claude with environment file
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver --env-file /path/to/mcp.env aldependencymcp-al-mcp-server node dist/server.js
```

### GitHub Copilot for VS Code Integration

#### Option 1: Using Pre-built Docker Image

1. **Install the MCP extension for VS Code** (if available) or configure manually in VS Code settings.

2. **Add MCP server configuration to VS Code settings.json:**
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
        "MAX_BRANCHES": "10"
      }
    }
  }
}
```

#### Option 2: Using Docker Compose

1. **Add to VS Code settings.json:**
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

#### Option 3: Local Node.js Installation

If you prefer to run without Docker:

1. **Install dependencies:**
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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Node.js environment | `production` |
| `REPO_TYPE` | Repository type | `bc-history-sandbox` |
| `REPO_URL` | Git repository URL | BC Sandbox repo |
| `DEFAULT_BRANCH` | Initial branch to load | `w1-26` |
| `CLONE_DEPTH` | Git clone depth for performance | `1` |
| `AUTO_CLEANUP` | Enable automatic cleanup | `true` |
| `CLEANUP_INTERVAL` | Cleanup frequency | `24h` |
| `MAX_BRANCHES` | Maximum branches to cache | `10` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Troubleshooting MCP Integration

#### Common Issues

1. **Environment variables not loaded**
   - Ensure you're using one of the methods above that properly sets environment variables
   - Check logs for "Environment variables check" to verify they're loaded

2. **Docker image not found**
   ```bash
   # Rebuild the image
   docker build -t aldependencymcp-al-mcp-server .
   ```

3. **Permission issues**
   ```bash
   # Ensure proper user permissions
   docker run --rm -i --user alserver aldependencymcp-al-mcp-server node dist/server.js
   ```

4. **Network connectivity**
   - Ensure the container can access GitHub for repository cloning
   - Check if corporate firewall blocks git operations

#### Debug Mode

To enable debug logging, set `LOG_LEVEL=debug`:

```bash
claude mcp add al-mcp-server -s user -- docker run --rm -i --user alserver 
  -e LOG_LEVEL=debug 
  aldependencymcp-al-mcp-server node dist/server.js
```

## Usage Examples

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REPO_TYPE` | Repository type (bc-history-sandbox, bc-fork, local-development) | bc-history-sandbox |
| `REPO_URL` | Git repository URL | https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git |
| `DEFAULT_BRANCH` | Comma-separated list of branches to track | w1-26,w1-24 |
| `AUTO_CLEANUP` | Enable automatic branch cleanup | true |
| `MAX_BRANCHES` | Maximum branches to keep | 10 |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | info |

### Repository Types

- **bc-history-sandbox**: Stefan Maron's managed BC history repository
- **bc-fork**: Custom BC fork or enterprise repository
- **local-development**: Local AL extension development
- **al-extension**: Single AL extension project

## Development

### Prerequisites
- Node.js 20+
- Docker
- Git

### Setup
```bash
git clone https://github.com/username/al-mcp-server.git
cd al-mcp-server
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
npm start
```

### Docker Development
```bash
docker-compose -f docker-compose.examples.yml up --build
```

## Usage Examples

### Search AL Objects
```typescript
// Find Customer table across BC versions
await mcp.call("al_search_objects", {
  query: "Customer",
  object_type: "table", 
  branches: ["w1-26", "w1-24"]
});

// Search Microsoft base objects
await mcp.call("al_search_objects", {
  query: "Customer",
  namespace: "Microsoft.*",
  branches: ["w1-26"]
});
```

### Dependency Discovery
```typescript
// Find object relationships and dependencies
await mcp.call("al_find_relationships", {
  source_object: "Customer",
  relationship_type: "uses",
  max_depth: 2,
  branches: ["w1-26"]
});
```

### Repository Management
```bash
# Add branch for development
mcp call al_add_branch '{"branch": "w1-25"}'

# Get repository status
mcp call al_repo_status '{"detailed": true}'
```

## Architecture

```
al-dependency-mcp/
├── src/
│   ├── server.ts              # Main MCP server
│   ├── git-manager.ts         # Git operations for BC repositories
│   ├── al-parser.ts           # AL object parsing
│   ├── al-analyzer.ts         # Dependency relationship analysis
│   ├── search-indexer.ts      # BC code indexing
│   └── types/                 # Type definitions
├── config/                    # Configuration files
├── scripts/                   # Utility scripts
└── docs/                      # Documentation
```

## Performance

- **Branch addition**: < 30 seconds
- **Object search**: < 2 seconds across all branches
- **Memory usage**: < 512MB for 5 branches
- **Storage**: ~50MB per branch (shallow)

## Security

- Read-only repository access
- Container isolation
- No hardcoded credentials
- Rate limiting on operations

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## Documentation

- **Setup Guide**: [docs/SETUP.md](docs/SETUP.md) - Detailed installation and configuration
- **MCP Integration**: [docs/MCP-INTEGRATION.md](docs/MCP-INTEGRATION.md) - Complete guide for Claude and VS Code
- **API Documentation**: [docs/API.md](docs/API.md) - Complete API reference
- **Examples**: [docs/EXAMPLES.md](docs/EXAMPLES.md) - Usage examples and workflows

## Support

- Issues: [GitHub Issues](https://github.com/username/al-mcp-server/issues)
- Documentation: [docs/](docs/)
- Examples: [config/examples/](config/examples/)

## License

MIT - See [LICENSE](LICENSE) file for details.