# AL MCP Server

[![npm version](https://badge.fury.io/js/al-mcp-server.svg)](https://badge.fury.io/js/al-mcp-server)
[![CI](https://github.com/StefanMaron/AL-Dependency-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanMaron/AL-Dependency-MCP-Server/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![.NET](https://img.shields.io/badge/.NET-8.0+-blue.svg)](https://dotnet.microsoft.com/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-orange.svg)](https://modelcontextprotocol.io/)

**Give AI assistants complete visibility into your AL dependencies and symbols.**

## What This Solves

AI coding assistants can't see compiled AL packages or understand Business Central object relationships. This creates a blind spot when helping with AL development.

The AL MCP Server bridges this gap by exposing your AL workspace's compiled symbols (.app files) directly to AI assistants through the Model Context Protocol.

## Quick Start

### Prerequisites

- **Node.js 18+** ([download](https://nodejs.org/))
- **.NET SDK 8.0+** ([download](https://dotnet.microsoft.com/download))
- **Compiled AL packages** (.app files in .alpackages directory)

**Verify your setup:**
```bash
dotnet --version  # Should show 8.0 or higher
```

The AL MCP Server installs automatically via `npx` - no manual installation needed.

### Configure Your AI Assistant

#### Claude Code (Recommended)

```bash
claude mcp add al-mcp-server -- npx al-mcp-server
```

Or via VS Code settings:
```json
{
  "claude.mcpServers": {
    "al-symbols-mcp": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

#### GitHub Copilot

Create `.vscode/mcp.json` in your workspace:
```json
{
  "servers": {
    "al-symbols-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

#### Cursor IDE

Add to Cursor settings (Settings → Features → Model Context Protocol):
```json
{
  "al-symbols-mcp": {
    "command": "npx",
    "args": ["al-mcp-server"]
  }
}
```

#### Continue (VS Code Extension)

Add to `~/.continue/config.json`:
```json
{
  "mcpServers": {
    "al-symbols-mcp": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

#### Cody (Sourcegraph)

Add to VS Code settings:
```json
{
  "cody.mcpServers": {
    "al-symbols-mcp": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

#### Other MCP-Compatible Tools

Use these connection details:
- **Command**: `npx`
- **Args**: `["al-mcp-server"]`
- **Type**: `stdio`

### Test It Works

Ask your AI assistant:
```
Search for Customer table in my AL project
```

The server will auto-start and provide intelligent AL assistance!

## Available Tools

The AL MCP Server provides 6 token-optimized tools for AL code analysis:

### Core Query Tools

**`al_search_objects`**
- Search for AL objects by name, type, or wildcard pattern
- Filter by business domain (Sales, Finance, Inventory, etc.)
- Support for all AL object types (Table, Page, Codeunit, Report, etc.)
- Token-efficient summary mode enabled by default

**`al_get_object_definition`**
- Get detailed object information by ID or name
- Includes fields, procedures, properties, and keys
- Configurable detail level with field/procedure limits
- Summary mode for token efficiency

**`al_find_references`**
- Find all references to an object or field
- Track extensions, variables, parameters, return types
- Field-level reference tracking across all object types
- Optional context for detailed reference information

**`al_search_object_members`**
- Unified search for object child elements
- Search procedures, fields, controls, or dataitems
- Wildcard pattern matching support
- Pagination and detail level control

**`al_get_object_summary`**
- Get intelligent categorized overview of objects
- Organizes procedures by purpose (validation, posting, utilities, etc.)
- Identifies key entry points automatically
- Highly token-efficient categorized output

### Package Management

**`al_packages`**
- Unified package management with action parameter
- **Load**: Auto-discover and load packages from project root
- **List**: Show all currently loaded packages
- **Stats**: Database statistics and object counts

## Capabilities

### Smart Object Discovery
- Search across all loaded AL packages simultaneously
- Wildcard pattern matching for flexible queries
- Filter by object type, package, or business domain
- Auto-discovery of .alpackages directories

### Deep Code Analysis
- Complete object definitions with all metadata
- Procedure and field information with properties
- Page control structure analysis
- Report/query dataitem traversal

### Reference Tracking
- Find all object references and dependencies
- Track object extensions and customizations
- Field-level usage analysis across pages, tables, reports
- Variable and parameter tracking in codeunits

### Business Domain Intelligence
- Search by business area (Sales, Purchasing, Finance, Inventory, Manufacturing, Service)
- Pattern-based domain detection
- Cross-package domain analysis

## Architecture

```
AL MCP Server
├── Symbol Extraction Layer
│   └── AL CLI integration for .app file parsing
├── Streaming Parser
│   └── Efficient handling of large symbol files (50MB+)
├── In-Memory Database
│   └── Optimized indices for sub-100ms queries
├── MCP Protocol Handler
│   └── JSON-RPC communication with AI assistants
└── Auto-Discovery Engine
    └── Smart .alpackages directory detection
```

**Performance Features:**
- Lazy initialization - packages load on first request
- Streaming JSON parsing prevents memory issues
- Multiple optimized indices for O(1) lookups
- Version filtering uses latest package only
- Token-optimized responses reduce AI context usage

## Requirements

**Runtime:**
- Node.js 18 or higher
- .NET SDK 8.0 or higher
- NuGet package source (nuget.org)

**Project Structure:**
- AL workspace with app.json
- Compiled .app packages in .alpackages directory

**Supported AL Packages:**
- Modern namespace-based packages
- Legacy non-namespace packages (PTEs)
- Business Central base application
- AppSource extensions

The server analyzes compiled AL symbols, not raw .al source files.

## Troubleshooting

**AL CLI not found**
- The server auto-installs AL tools
- Requires .NET SDK 8.0 or higher
- Verify: `dotnet --version`

**NU1100 error**
- Update to .NET SDK 8.0+
- Configure NuGet: `dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org`

**No sources found**
- Check NuGet sources: `dotnet nuget list source`
- Should include nuget.org

**No packages found**
- Ensure .app files exist in .alpackages directory
- Use `al_auto_discover` tool to search for packages
- Check that packages were compiled successfully

**Server not responding**
- Verify Node.js 18+ is installed
- Check AI assistant MCP configuration
- Review server logs in AI assistant output

**Need Help?**
- [Open an issue](https://github.com/StefanMaron/AL-Dependency-MCP-Server/issues)
- [View documentation](https://github.com/StefanMaron/AL-Dependency-MCP-Server#readme)

## Example Usage

Once configured, ask your AI assistant:

```
"Show me all Sales-related codeunits"
"Find all references to the Customer table"
"What procedures are in the Sales-Post codeunit?"
"Search for all pages that use the Item table"
"Give me a summary of the Gen. Journal-Post Batch codeunit"
```

The AI assistant will use the MCP tools to provide accurate, context-aware responses based on your actual AL packages.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for changes
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Transform AL development with AI assistants that truly understand your codebase.**