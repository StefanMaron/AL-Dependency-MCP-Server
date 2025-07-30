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
  -e DEFAULT_BRANCHES=main,enterprise-v2024 \
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
- `al_search_objects` - Browse and search BC code objects
- `al_get_object` - Get detailed object information for understanding dependencies
- `al_find_relationships` - Discover object relationships and dependencies
- `al_workspace_overview` - Get workspace overview to understand project dependencies

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REPO_TYPE` | Repository type (bc-history-sandbox, bc-fork, local-development) | bc-history-sandbox |
| `REPO_URL` | Git repository URL | https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git |
| `DEFAULT_BRANCHES` | Comma-separated list of branches to track | w1-26,w1-24 |
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

## License

MIT - See [LICENSE](LICENSE) file for details.

## Support

- Issues: [GitHub Issues](https://github.com/username/al-mcp-server/issues)
- Documentation: [docs/](docs/)
- Examples: [config/examples/](config/examples/)