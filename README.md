# AL MCP Server

**AI-powered symbol analysis for Microsoft Dynamics 365 Business Central development. Get intelligent insights from compiled AL packages directly in your AI assistant.**

## Quick Start

### Step 1: Install Prerequisites
- **Node.js 18+** ([download here](https://nodejs.org/))
- **Compiled AL packages** (.app files in .alpackages directory)

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
    "al": {
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
- **Type**: `stdio` (if required)

## Step 3: Test It Works

After configuration, test with your AI assistant:
```
Can you search for Customer tables in my AL project?
```

The server will automatically start and provide AL development assistance!

## What You Can Do

Once configured, your AI assistant becomes an AL development expert with access to:

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
- Any MCP-compatible AI assistant

**What Gets Installed Automatically:**
- AL MCP Server (via npx)
- Microsoft AL CLI tools (.NET-based)

The server analyzes **compiled AL symbols**, not raw .al source files.

## Troubleshooting

**Common Issues:**

- **"AL CLI not found"** - The server auto-installs AL tools, but may require .NET SDK
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

**Transform your AL development with AI-powered code assistance!**