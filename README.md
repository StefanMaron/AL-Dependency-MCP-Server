# AL MCP Server

**Model Context Protocol (MCP) server providing intelligent AL (Application Language) symbol analysis for Microsoft Dynamics 365 Business Central development. Works with compiled AL packages (.app files) to provide deep code insights, dependency analysis, and cross-project references.**

## Summary

The AL MCP Server enables AI coding assistants to understand and work with compiled AL symbol packages (.app files) by providing access to symbol information, object definitions, and cross-project dependencies. It requires compiled AL packages or .alpackages directories - it does not analyze raw .al source files directly.

## Features

### Core AL Intelligence
- **Object Search & Discovery** - Find tables, pages, codeunits, and reports across all packages
- **Symbol Resolution** - Get complete object definitions with fields, procedures, and properties  
- **Dependency Analysis** - Understand relationships between objects and packages
- **Cross-Package Support** - Works with Base Application, System, and custom extensions
- **Business Domain Classification** - Categorize objects by domain (Sales, Finance, Inventory, etc.)

### AI-Optimized Performance
- **Token-Efficient Responses** - Smart summaries that minimize AI context usage
- **Streaming Parsing** - Handles large symbol files (50MB+ Base Application) efficiently
- **In-Memory Indexing** - Sub-100ms query response times
- **Auto-Discovery** - Automatically finds and loads .alpackages directories

### Developer Experience
- **One-Command Setup** - `npx al-mcp-server` configures everything automatically
- **Cross-Platform Support** - Windows, macOS, and Linux
- **Multiple Editor Integration** - Works with Claude Code, GitHub Copilot, Cursor, Continue, Cody
- **Smart Workspace Detection** - Identifies AL projects by app.json and .al files

## Prerequisites

- **Node.js** 18 or higher
- **.NET SDK** (for AL CLI tools)
- **Compiled AL packages** - Either .alpackages directory with .app symbol files, or individual .app packages to analyze

The installer will automatically check for and install AL CLI tools if needed.

### Manual AL CLI Tools Installation

If needed, you can manually install the AL CLI tools (choose based on your OS):

**Windows:**
```bash
dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools --interactive --prerelease --global
```

**Linux:**
```bash
dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools.Linux --interactive --prerelease --global
```

**macOS:**
```bash
dotnet tool install Microsoft.Dynamics.BusinessCentral.Development.Tools.Osx --interactive --prerelease --global
```

## Package Discovery Approach

The AL MCP Server automatically discovers AL symbol packages using the following approach to prevent system-wide disk scanning:

### Search Strategy

1. **Primary Search**: Look for `.alpackages` directories
   - Searches current working directory and 2 levels deep
   - Skips system directories (`node_modules`, `.git`, `AppData`, `Program Files`, etc.)
   - Stops at first `.alpackages` directory found

2. **Fallback Search**: If no `.alpackages` found, check VS Code AL extension settings
   - **Workspace settings**: `.vscode/settings.json` in current directory
   - **Folder settings**: `.vscode/settings.json` in parent directories (up to 3 levels)
   - Reads `al.packageCachePath` setting and validates the path contains `.app` files

### VS Code Integration

The server respects your AL extension configuration:

```json
{
  "al.packageCachePath": "./symbols"
}
```

**Supported locations:**
- ✅ Workspace settings (`.vscode/settings.json`)
- ✅ Folder settings (parent directory `.vscode/settings.json` files)
- ❌ User settings (global VS Code settings) - **Known Limitation**

### Security & Performance

- **Limited depth**: Maximum 2 directory levels to prevent infinite recursion
- **Directory filtering**: Automatically skips system, cache, and build directories
- **Scope restriction**: Only searches current working directory tree
- **No system scanning**: Never accesses system folders, temp directories, or recycle bin

## Adding AL MCP Server to Your AI Assistant

Configure your AI assistant to use the AL MCP Server. The server will be automatically downloaded and started when your assistant needs it.

### Claude Code (VS Code Extension)

**Option 1: Via Settings UI**
- Open VS Code Settings → Search "Claude Code" → MCP Servers
- Add server: Name: `al`, Command: `npx`, Args: `["al-mcp-server"]`

**Option 2: Via settings.json**
```json
{
  "claude.mcpServers": {
    "al": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

**Option 3: Via Command Line**
```bash
# Add AL MCP server to Claude Code
claude mcp add al-mcp-server -- npx al-mcp-server
```

### GitHub Copilot (VS Code)

Create `.vscode/mcp.json` in your AL workspace:
```json
{
  "servers": {
    "al": {
      "type": "stdio", 
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

### Cursor IDE

Add to Cursor settings (Settings → Features → Model Context Protocol):
```json
{
  "al": {
    "command": "npx",
    "args": ["al-mcp-server"]
  }
}
```

### Continue (VS Code Extension)

Add to `~/.continue/config.json`:
```json
{
  "mcpServers": {
    "al": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

### Cody (Sourcegraph)

Add to VS Code settings:
```json
{
  "cody.mcpServers": {
    "al": {
      "command": "npx",
      "args": ["al-mcp-server"]
    }
  }
}
```

### Other MCP-Compatible Tools

Use these connection details:
- **Command**: `npx`
- **Args**: `["al-mcp-server"]`
- **Type**: `stdio` (for tools that require it)

## Quick Test

After configuring your AI assistant, test the connection:
```
Can you search for Customer tables in my AL project?
```

**Note:** Ensure you have compiled AL packages (.app files) in your .alpackages directory or specify the path to your symbol packages. The server analyzes compiled symbols, not raw .al source files.

Your assistant will automatically download and start the AL MCP Server, then provide AL-specific development assistance!

## Available MCP Tools

Once configured, your AI assistant gains access to these AL-specific capabilities:

### Object Discovery
- **Search objects** by name, type, or pattern across all packages
- **Get object summaries** with organized procedure categories (96% token reduction vs full definitions)
- **Find object references** and dependencies across the codebase
- **Auto-discover packages** from .alpackages directories

### Detailed Analysis  
- **Get complete object definitions** with fields, procedures, and properties
- **Search procedures** within specific objects with pattern filtering
- **Search fields** within tables with type and property information
- **Search controls** within pages for UI structure analysis

### Business Intelligence
- **Search by business domain** (Sales, Finance, Inventory, Manufacturing, etc.)
- **Find object extensions** and customizations
- **Analyze package dependencies** and relationships
- **Performance metrics** and statistics

## Architecture

```
AL MCP Server
├── Symbol Extraction (AL CLI integration)
├── Streaming Parser (handles 50MB+ files efficiently)  
├── In-Memory Database (optimized indices for fast queries)
├── MCP Protocol Handler (JSON-RPC communication)
└── Auto-Discovery (smart .alpackages detection)
```

## Changelog

### Latest Release (v2.0.4)
- ✅ **Auto-discover AL projects** - Finds app.json + .app files in project directories
- ✅ **Version filtering** - Uses only the most recent version of each package  
- ✅ **Legacy AL support** - Works with non-namespace AL packages (PTEs)
- ✅ **Fixed ZIP extraction** - Resolves AL package NAVX header issues

### Previous Releases
- **v2.0.3** - Cross-platform extraction support, VS Code settings integration
- **v2.0.2** - OS-specific AL CLI installation improvements

📋 **Full changelog**: See [CHANGELOG.md](./CHANGELOG.md) for complete release history

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Ensure all tests pass
5. Submit a pull request

---

**Transform your AL development with AI-powered code assistance!** 🚀