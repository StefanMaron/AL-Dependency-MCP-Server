# AL MCP Server

[![npm version](https://badge.fury.io/js/al-mcp-server.svg)](https://badge.fury.io/js/al-mcp-server)
[![CI](https://github.com/StefanMaron/AL-Dependency-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanMaron/AL-Dependency-MCP-Server/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![.NET](https://img.shields.io/badge/.NET-8.0+-blue.svg)](https://dotnet.microsoft.com/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-orange.svg)](https://modelcontextprotocol.io/)

**Bridge the gap between AL development and AI coding assistance.**

## The Problem This Solves

**AI assistants are "blind" to AL dependencies and symbols.** When working with Microsoft Dynamics 365 Business Central AL code, AI assistants cannot see:

- Compiled AL packages (.app files) and their symbols
- Object relationships and dependencies between AL objects  
- Available procedures, fields, and properties from dependency packages
- Business Central base application structure and extensions

**Without this visibility, AI assistants can't provide effective AL development help.**

## The Solution

**The AL MCP Server makes AL dependencies and symbols visible to AI coding assistants.** 

This MCP (Model Context Protocol) server exposes compiled AL packages (.app files) and their symbol information directly to AI assistants, enabling them to:

- Understand your AL project's complete object structure and dependencies
- Provide context-aware code suggestions based on actual AL symbols
- Help navigate complex AL object relationships and extensions
- Offer informed guidance on AL development patterns and best practices

**Transform your AL development workflow with AI that truly understands your codebase.**

## Quick Start

### Step 1: Install Prerequisites
- **Node.js 18+** ([download here](https://nodejs.org/))
- **.NET SDK 8.0+** ([download here](https://dotnet.microsoft.com/download)) - Required for AL CLI tools
- **NuGet package source** - Ensure nuget.org is configured (usually automatic)
- **Compiled AL packages** (.app files in .alpackages directory)

**Verify your setup:**
```bash
# Check .NET version (should be 8.0 or higher)
dotnet --version

# Check NuGet sources (should include nuget.org)
dotnet nuget list source
```

**That's it!** The AL MCP Server installs automatically via `npx` - no manual installation needed.

### Step 2: Configure Your AI Assistant

Choose your AI assistant and add this MCP server configuration:

**Installation Command**: `npx al-mcp-server`

## AI Assistant Setup

### Claude Code (Recommended)

**Quickest**: Use the command line:
```bash
claude mcp add al-mcp-server -- npx al-mcp-server
```

**Alternative 1**: Via VS Code Settings UI
- Open VS Code Settings → Search "Claude Code" → MCP Servers  
- Add server: Name: `al`, Command: `npx`, Args: `["al-mcp-server"]`

**Alternative 2**: Via settings.json
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

### GitHub Copilot (VS Code)

Create `.vscode/mcp.json` in your AL workspace:
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

### Cursor IDE

Add to Cursor settings (Settings → Features → Model Context Protocol):
```json
{
  "al-symbols-mcp": {
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
    "al-symbols-mcp": {
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
    "al-symbols-mcp": {
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
- **Type**: `stdio` (if required)

## Step 3: Test It Works

After configuration, test with your AI assistant:
```
Can you search for Customer tables in my AL project?
```

The server will automatically start and provide AL development assistance!

## What This Enables

Once configured, your AI assistant gains complete visibility into your AL environment and becomes an AL development expert with access to:

### Smart Object Discovery
- **Search objects** by name, type, or pattern across all packages
- **Get object summaries** with organized procedure categories  
- **Find object references** and dependencies across the codebase
- **Auto-discover packages** from .alpackages directories

### Deep Code Analysis
- **Get complete object definitions** with fields, procedures, and properties
- **Search procedures** within specific objects with pattern filtering
- **Search fields** within tables with type and property information
- **Search page controls** for UI structure analysis

### Business Domain Intelligence
- **Search by business domain** (Sales, Finance, Inventory, Manufacturing, etc.)
- **Find object extensions** and customizations
- **Analyze package dependencies** and relationships

## Requirements

**What You Need:**
- AL workspace with compiled .app packages (in `.alpackages` directory)
- Node.js 18+ installed
- .NET SDK 8.0+ installed
- NuGet package source configured (nuget.org)
- Any MCP-compatible AI assistant

**What Gets Installed Automatically:**
- AL MCP Server (via npx)
- Microsoft AL CLI tools (.NET-based)

The server analyzes **compiled AL symbols**, not raw .al source files.

## Troubleshooting

**Common Issues:**

- **"AL CLI not found"** - The server auto-installs AL tools, but requires .NET SDK 8.0+
- **NU1100 error** - Update to .NET SDK 8.0+ or configure NuGet sources: `dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org`
- **"No sources found"** - Configure NuGet source: `dotnet nuget list source` should show nuget.org
- **"supports: net8.0" error** - Install .NET SDK 8.0 or higher (earlier versions are incompatible)
- **"No packages found"** - Ensure you have `.app` files in `.alpackages` directory 
- **"Server not responding"** - Check that Node.js 18+ is installed and accessible

**Need Help?**
- Check [Issues on GitHub](https://github.com/StefanMaron/AL-Dependency-MCP-Server/issues)
- View [Full Documentation](https://github.com/StefanMaron/AL-Dependency-MCP-Server#readme)

## Architecture

The AL MCP Server uses a multi-layer architecture for efficient AL symbol analysis:

```
AL MCP Server
├── Symbol Extraction (AL CLI integration)
├── Streaming Parser (handles 50MB+ files efficiently)  
├── In-Memory Database (optimized indices for fast queries)
├── MCP Protocol Handler (JSON-RPC communication)
└── Auto-Discovery (smart .alpackages detection)
```

## Changelog

### Latest Release (v2.0.5)
- ✅ **Auto-discover AL projects** - Finds app.json + .app files in project directories
- ✅ **Version filtering** - Uses only the most recent version of each package  
- ✅ **Legacy AL support** - Works with non-namespace AL packages (PTEs)
- ✅ **Fixed ZIP extraction** - Resolves AL package NAVX header issues

📋 **Full changelog**: See [CHANGELOG.md](./CHANGELOG.md) for complete release history

## Contributing

1. Fork the repository
2. Create a feature branch  
3. Write tests for your changes
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Stop working with "blind" AI assistants. Give them the AL symbol visibility they need to truly help your development.**