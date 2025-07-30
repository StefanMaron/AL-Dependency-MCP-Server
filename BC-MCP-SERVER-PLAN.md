# AL Language MCP Server - Project Plan

## Overview
A Model Context Protocol (MCP) server designed specifically for AL (Application Language) development and Microsoft Dynamics 365 Business Central source code navigation. This server provides AI coding assistants with specialized AL language intelligence while supporting flexible repository sources - from official Microsoft BC repositories to custom forks, local development environments, and enterprise deployments.

## Repository Structure
**Separate GitHub Repository**: `al-mcp-server`

```
al-mcp-server/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── docker-compose.examples.yml  # Example configurations
├── package.json
├── src/
│   ├── server.ts              # Main MCP server implementation
│   ├── git-manager.ts         # Git operations and repository management
│   ├── al-parser.ts           # AL language specific parsing
│   ├── al-analyzer.ts         # AL object dependency analysis
│   ├── search-indexer.ts      # Code indexing and search functionality
│   ├── repository-detector.ts  # Auto-detect repository type and structure
│   └── types/
│       ├── mcp-types.ts       # MCP protocol types
│       ├── al-types.ts        # AL language specific types
│       └── al-objects.ts      # AL object definitions
├── scripts/
│   ├── init-repo.sh           # Initialize repository in container
│   ├── cleanup-branches.sh    # Branch cleanup utilities
│   └── detect-al-structure.sh # Auto-detect AL project structure
├── config/
│   ├── al-object-patterns.json # AL object recognition patterns
│   ├── bc-object-types.json    # BC object type definitions
│   ├── stm-guidelines.json     # STM coding standards validation
│   └── examples/
│       ├── microsoft-bc.yml   # Microsoft BC repository config
│       ├── local-dev.yml      # Local development config
│       └── enterprise.yml     # Enterprise BC fork config
└── docs/
    ├── API.md                 # MCP server API documentation
    ├── SETUP.md              # Setup and configuration guide
    ├── EXAMPLES.md           # Usage examples for different scenarios
    └── AL-FEATURES.md        # AL-specific features documentation
```

## Core Architecture

### Docker Container Design
```dockerfile
FROM node:20-alpine

# Install git and AL-specific tools
RUN apk add --no-cache git curl

# Create working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/

# AL language configuration
COPY config/al-patterns.json ./config/
COPY config/bc-object-types.json ./config/
COPY config/stm-guidelines.json ./config/

# No hardcoded repository - configured at runtime
# Repository initialization handled by init scripts based on environment

EXPOSE 3000
CMD ["node", "src/server.js"]
```

### Docker Compose Configuration

#### Example 1: Microsoft BC Repository
```yaml
version: '3.8'
services:
  al-mcp-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - repo-cache:/app/repo-cache
      - index-cache:/app/index-cache
    environment:
      - NODE_ENV=production
      - REPO_TYPE=microsoft-bc
      - REPO_URL=https://github.com/microsoft/BCApps.git
      - DEFAULT_BRANCHES=w1-26,w1-24
      - AUTO_CLEANUP=true
      - CLEANUP_INTERVAL=24h
      - MAX_BRANCHES=10
    restart: unless-stopped

volumes:
  repo-cache:
  index-cache:
```

#### Example 2: Local Development
```yaml
version: '3.8'
services:
  al-mcp-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./src/MyExtension:/workspace:ro
      - ../BCApps:/bc-reference:ro
      - index-cache:/app/index-cache
    environment:
      - NODE_ENV=development
      - REPO_TYPE=local-development
      - WORKSPACE_PATH=/workspace
      - REFERENCE_PATH=/bc-reference
      - WATCH_FILES=true
    restart: unless-stopped

volumes:
  index-cache:
```

#### Example 3: Enterprise BC Fork
```yaml
version: '3.8'
services:
  al-mcp-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - repo-cache:/app/repo-cache
      - index-cache:/app/index-cache
    environment:
      - NODE_ENV=production
      - REPO_TYPE=bc-fork
      - REPO_URL=https://github.com/acme-corp/BCApps.git
      - DEFAULT_BRANCHES=main,enterprise-v2024
      - AUTH_TOKEN_FILE=/run/secrets/git_token
    secrets:
      - git_token
    restart: unless-stopped

volumes:
  repo-cache:
  index-cache:

secrets:
  git_token:
    file: ./secrets/git-token.txt
```

## MCP Server Implementation

### Core MCP Tools

#### 1. Repository and Branch Management
```typescript
// Add branch to repository
{
  "name": "al_add_branch",
  "description": "Add branch to the AL repository (BC version, feature branch, etc.)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "branch": {
        "type": "string",
        "description": "Branch name (e.g., w1-24, w1-25, main, develop)",
        "examples": ["w1-26", "main", "feature/new-approval-flow"]
      },
      "shallow": {
        "type": "boolean",
        "default": true,
        "description": "Use shallow clone (depth 1) for space efficiency"
      },
      "auto_detect_type": {
        "type": "boolean", 
        "default": true,
        "description": "Auto-detect if this is a BC version branch or feature branch"
      }
    },
    "required": ["branch"]
  }
}

// Remove branch from repository
{
  "name": "al_remove_branch",
  "description": "Remove branch from local repository cache",
  "inputSchema": {
    "type": "object",
    "properties": {
      "branch": {
        "type": "string",
        "description": "Branch name to remove"
      },
      "cleanup_local": {
        "type": "boolean",
        "default": true,
        "description": "Also remove local branch references and cached data"
      }
    },
    "required": ["branch"]
  }
}

// Initialize or switch repository
{
  "name": "al_set_repository",
  "description": "Initialize or switch to a different AL repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "repo_url": {
        "type": "string",
        "description": "Git repository URL (GitHub, Azure DevOps, etc.)"
      },
      "repo_path": {
        "type": "string", 
        "description": "Local repository path (alternative to repo_url)"
      },
      "repo_type": {
        "type": "string",
        "enum": ["microsoft-bc", "bc-fork", "al-extension", "local-development"],
        "description": "Repository type for optimized handling"
      },
      "default_branches": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Branches to initially track"
      }
    }
  }
}
```

#### 2. AL Object Discovery and Navigation
```typescript
// Search AL objects across branches
{
  "name": "al_search_objects",
  "description": "Search for AL objects (tables, pages, codeunits, reports, enums, interfaces)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query (object name, pattern, or keyword)"
      },
      "object_type": {
        "type": "string",
        "enum": ["table", "page", "codeunit", "report", "query", "enum", "interface", "permissionset", "xmlport", "controladdin"],
        "description": "Filter by AL object type"
      },
      "branches": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Branches to search in (default: all available)"
      },
      "namespace": {
        "type": "string",
        "description": "Filter by namespace (e.g., 'STM.*', 'Microsoft.*')"
      },
      "id_range": {
        "type": "string",
        "description": "Filter by object ID range (e.g., '50000-59999', 'AppSource', 'PTE')",
        "examples": ["50000-59999", "1-49999", "AppSource", "PTE"]
      },
      "include_obsolete": {
        "type": "boolean",
        "default": false,
        "description": "Include objects marked as obsolete"
      }
    },
    "required": ["query"]
  }
}

// Get detailed AL object information
{
  "name": "al_get_object",
  "description": "Get detailed information about specific AL object",
  "inputSchema": {
    "type": "object",
    "properties": {
      "object_type": {"type": "string"},
      "object_name": {"type": "string"},
      "object_id": {"type": "number", "description": "Object ID (alternative to name)"},
      "branch": {"type": "string"},
      "include_dependencies": {
        "type": "boolean",
        "default": false,
        "description": "Include object dependencies and references"
      },
      "include_events": {
        "type": "boolean", 
        "default": false,
        "description": "Include published events and event subscribers"
      },
      "include_permissions": {
        "type": "boolean",
        "default": false, 
        "description": "Include required permissions for this object"
      }
    },
    "required": ["object_type"]
  }
}

// Find AL object relationships
{
  "name": "al_find_relationships",
  "description": "Find relationships between AL objects (extends, implements, uses)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "source_object": {"type": "string", "description": "Source object to analyze"},
      "relationship_type": {
        "type": "string",
        "enum": ["extends", "implements", "uses", "used_by", "events", "all"],
        "default": "all",
        "description": "Type of relationships to find"
      },
      "max_depth": {
        "type": "number",
        "default": 2,
        "description": "Maximum relationship depth to traverse"
      },
      "branches": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Branches to search in"
      }
    },
    "required": ["source_object"]  
  }
}
```

#### 3. AL Extension and Dependency Analysis
```typescript
// Analyze AL extension dependencies
{
  "name": "al_analyze_extension",
  "description": "Analyze AL extension dependencies, compatibility, and structure",
  "inputSchema": {
    "type": "object",
    "properties": {
      "extension_path": {
        "type": "string",
        "description": "Path to AL extension (app.json location)"
      },
      "analysis_type": {
        "type": "string",
        "enum": ["dependencies", "dependents", "compatibility", "structure", "permissions"],
        "default": "dependencies",
        "description": "Type of analysis to perform"
      },
      "target_bc_version": {
        "type": "string", 
        "description": "Target BC version for compatibility analysis (e.g., 'w1-26')"
      },
      "include_transitive": {
        "type": "boolean",
        "default": true,
        "description": "Include transitive dependencies"
      },
      "check_appsource": {
        "type": "boolean",
        "default": false,
        "description": "Check AppSource compliance and requirements"
      }
    },
    "required": ["extension_path"]
  }
}

// BC version migration analysis
{
  "name": "al_migration_analysis",
  "description": "Analyze changes needed for BC version migration",
  "inputSchema": {
    "type": "object",
    "properties": {
      "extension_path": {"type": "string"},
      "source_version": {
        "type": "string", 
        "description": "Current BC version (e.g., 'w1-24')"
      },
      "target_version": {
        "type": "string",
        "description": "Target BC version (e.g., 'w1-26')"
      },
      "analysis_depth": {
        "type": "string",
        "enum": ["breaking_changes", "deprecations", "new_features", "full"],
        "default": "breaking_changes"
      },
      "generate_report": {
        "type": "boolean",
        "default": true,
        "description": "Generate detailed migration report"
      }
    },
    "required": ["extension_path", "source_version", "target_version"]
  }
}
```

#### 4. Repository Status and Management
```typescript
// List available branches
{
  "name": "al_list_branches",
  "description": "List available and tracked branches in AL repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": {
        "type": "string",
        "description": "Filter pattern (e.g., 'w1-*', 'feature/*', 'main')"
      },
      "include_remote": {
        "type": "boolean",
        "default": false,
        "description": "Include remote branches not yet tracked locally"
      },
      "branch_type": {
        "type": "string",
        "enum": ["bc_version", "feature", "release", "all"],
        "default": "all",
        "description": "Filter by branch type"
      }
    }
  }
}

// Get repository status and statistics
{
  "name": "al_repo_status",
  "description": "Get current AL repository status, statistics, and health",
  "inputSchema": {
    "type": "object",
    "properties": {
      "detailed": {
        "type": "boolean",
        "default": false,
        "description": "Include detailed branch and object statistics"
      },
      "include_performance": {
        "type": "boolean",
        "default": false,
        "description": "Include indexing and caching performance metrics"
      },
      "health_check": {
        "type": "boolean", 
        "default": true,
        "description": "Perform repository health validation"
      }
    }
  }
}

// Get AL workspace overview
{
  "name": "al_workspace_overview",
  "description": "Get overview of AL development workspace and project structure",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workspace_path": {
        "type": "string",
        "description": "Workspace path (if different from configured)"
      },
      "include_dependencies": {
        "type": "boolean",
        "default": true,
        "description": "Include extension dependencies in overview"
      },
      "scan_depth": {
        "type": "number",
        "default": 2,
        "description": "Directory scan depth for AL projects"
      }
    }
  }
}
```

## Key Features

### 1. Flexible Repository Support
- **Multiple source types**: Microsoft BC, custom forks, local development, enterprise repos
- **Auto-detection**: Automatically detect repository type and AL project structure
- **Live workspace**: Monitor local AL development with file watching
- **Branch management**: Add/remove branches on-demand with intelligent caching

### 2. Advanced AL Language Intelligence
- **Complete AL parsing**: All object types (tables, pages, codeunits, reports, enums, interfaces, permission sets)
- **Namespace awareness**: Handle STM.*, Microsoft.*, and custom namespace patterns
- **Object relationships**: Track extends, implements, uses, and event relationships
- **ID range analysis**: Detect AppSource vs. PTE vs. Microsoft object ranges
- **Permission analysis**: Understand table permissions and entitlements

### 3. BC Version Compatibility & Migration
- **Cross-version analysis**: Compare objects across BC versions
- **Breaking change detection**: Identify obsoleted objects and methods
- **Migration guidance**: Suggest upgrade paths for deprecated functionality
- **New feature discovery**: Highlight new AL capabilities in target versions

### 4. Development Workflow Integration
- **Local development**: Mount and monitor active AL projects
- **CI/CD ready**: Docker-based deployment for build pipelines
- **Multi-environment**: Support sandbox and production configurations
- **Performance optimization**: Shallow cloning, incremental indexing, smart caching

## Implementation Plan

### Phase 1: Core Infrastructure
1. **Docker container setup** with basic BC repository
2. **MCP server framework** with essential tools
3. **Git operations manager** for branch manipulation
4. **Basic AL object recognition** and parsing

### Phase 2: Advanced Features
1. **Search indexing system** for fast object discovery
2. **Dependency analysis engine** for extension compatibility
3. **Multi-branch operations** and comparison tools
4. **Performance optimizations** and caching

### Phase 3: Developer Integration
1. **VS Code extension** for direct integration
2. **Claude Desktop configuration** examples
3. **API documentation** and usage guides
4. **Community feedback** and feature requests

## Technical Considerations

### Repository Size Management
- **Initial clone**: ~100MB (single branch, depth 1)
- **Additional branches**: ~50MB each (shallow)
- **Full repository**: 10GB+ (avoided through partial cloning)
- **Storage optimization**: Automatic cleanup of unused branches

### Performance Targets
- **Branch addition**: < 30 seconds
- **Object search**: < 2 seconds across all tracked branches
- **Dependency analysis**: < 5 seconds for typical extensions
- **Memory usage**: < 512MB for container with 5 branches

### Security and Reliability
- **Read-only access**: Server only reads BC repository
- **Container isolation**: Each instance isolated from host
- **Error handling**: Graceful degradation on git operations
- **Rate limiting**: Prevent excessive branch operations

## AL Development Scenarios

### Scenario 1: Microsoft BC Development
```bash
# Configure for official Microsoft BC repository
docker run -p 3000:3000 \
  -e REPO_URL=https://github.com/microsoft/BCApps.git \
  -e REPO_TYPE=microsoft-bc \
  -e DEFAULT_BRANCHES=w1-26,w1-24 \
  al-mcp-server:latest
```

### Scenario 2: Local Extension Development  
```bash
# Mount local AL extension with BC reference
docker run -p 3000:3000 \
  -v ./MySTMExtension:/workspace:ro \
  -v ./BCApps:/bc-reference:ro \
  -e REPO_TYPE=local-development \
  -e WORKSPACE_PATH=/workspace \
  -e REFERENCE_PATH=/bc-reference \
  al-mcp-server:latest
```

### Scenario 3: Enterprise BC Fork
```bash
# Use company-specific BC fork
docker run -p 3000:3000 \
  -e REPO_URL=https://github.com/acme-corp/BCApps.git \
  -e REPO_TYPE=bc-fork \
  -e DEFAULT_BRANCHES=main,enterprise-v2024 \
  al-mcp-server:latest
```

## Usage Examples

### AL Object Discovery
```typescript
// Find Customer table across BC versions
await mcp.call("al_search_objects", {
  query: "Customer",
  object_type: "table", 
  branches: ["w1-26", "w1-24"],
  include_obsolete: false
});

// Search STM objects by namespace
await mcp.call("al_search_objects", {
  query: "*",
  namespace: "STM.*",
  id_range: "50000-59999"
});

// Get detailed approval codeunit information
await mcp.call("al_get_object", {
  object_type: "codeunit",
  object_name: "Approval Management",
  include_dependencies: true,
  include_events: true,
  include_permissions: true
});
```

### Extension Analysis and Migration
```typescript
// Analyze STM extension for BC 26 compatibility
await mcp.call("al_analyze_extension", {
  extension_path: "/workspace/STM.ImprovedApprovals",
  analysis_type: "compatibility",
  target_bc_version: "w1-26",
  check_appsource: true
});

// Generate migration report for BC version upgrade
await mcp.call("al_migration_analysis", {
  extension_path: "/workspace/MyExtension", 
  source_version: "w1-24",
  target_version: "w1-26",
  analysis_depth: "full",
  generate_report: true
});

// Validate against STM coding guidelines
await mcp.call("al_validate_stm_guidelines", {
  extension_path: "/workspace/STM.PowerAutomate",
  guideline_categories: ["naming", "security", "error_handling"],
  generate_fixes: true
});
```

### Repository Management
```bash
# Add branch for development
mcp call al_add_branch '{"branch": "feature/power-automate-integration"}'

# Get repository status and health
mcp call al_repo_status '{"detailed": true, "health_check": true}'

# Get workspace overview
mcp call al_workspace_overview '{"include_dependencies": true}'
```

## Deployment Options

### 1. Docker Hub Image
```bash
# Quick start with Microsoft BC
docker run -p 3000:3000 \
  -e REPO_URL=https://github.com/microsoft/BCApps.git \
  -v al-cache:/app/repo-cache \
  al-mcp-server:latest

# Local development with mounted workspace
docker run -p 3000:3000 \
  -v ./my-al-project:/workspace:ro \
  -v al-cache:/app/repo-cache \
  -e REPO_TYPE=local-development \
  -e WORKSPACE_PATH=/workspace \
  al-mcp-server:latest
```

### 2. Development Setup
```bash
git clone https://github.com/username/al-mcp-server.git
cd al-mcp-server
docker-compose -f docker-compose.examples.yml up --build
```

### 3. Cloud Deployment
- **Azure Container Instances**: Team collaboration with shared AL repositories
- **AWS ECS**: Scalable deployments for enterprise BC development
- **GitHub Codespaces**: Cloud-based AL development environments
- **Docker Swarm**: Multi-node deployment for large AL codebases

## Future Enhancements

### Advanced AL Analysis
- **Code quality metrics**: Analyze AL code patterns
- **Performance insights**: Identify potential bottlenecks
- **Best practice validation**: Compare against STM guidelines
- **Documentation generation**: Auto-generate API docs from AL objects

### Integration Expansions  
- **GitHub Actions**: Automated compatibility checking in CI/CD
- **VS Code IntelliSense**: Enhanced autocomplete with BC objects
- **Power Platform**: Integration with Power Automate/Apps
- **Testing framework**: Automated extension testing against BC versions

### Community Features
- **Shared configurations**: Community-maintained branch sets
- **Extension marketplace**: Integration with AppSource patterns
- **Learning resources**: Interactive BC development tutorials
- **Collaboration tools**: Team-shared BC exploration sessions

---

**Note**: This project should be implemented as a separate GitHub repository to maintain clean separation from any source code repositories. The MCP server will clone and manage AL repositories internally within its Docker container, supporting multiple repository sources flexibly.

**Repository Name**: `al-mcp-server`
**License**: MIT (to encourage community contributions)
**Maintainers**: AL development community with focus on STM projects
**Documentation**: Comprehensive setup guides, API references, and AL-specific feature documentation
**Target Users**: AL developers, BC consultants, enterprise development teams, AI coding assistants