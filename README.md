# AL MCP Server

**Model Context Protocol (MCP) server providing intelligent AL (Application Language) code assistance for Microsoft Dynamics 365 Business Central development.**

## 🚀 Installation for Coding Assistants

### Claude Code (VS Code Extension)

1. **Install Claude Code** from the VS Code marketplace
2. **Configure the AL MCP Server** in your Claude Code settings:

**Option 1: Via Claude Code Settings UI**
- Open VS Code Settings (Ctrl/Cmd + ,)
- Search for "Claude Code"
- Find "MCP Servers" section
- Add new server with these details:
  - **Name**: `al`
  - **Command**: `node`
  - **Args**: `["/absolute/path/to/al-mcp-server/dist/index.js"]`

**Option 2: Via settings.json**
```json
{
  "claude.mcpServers": {
    "al": {
      "command": "node",
      "args": ["/absolute/path/to/al-mcp-server/dist/index.js"]
    }
  }
}
```

### GitHub Copilot (VS Code)

GitHub Copilot doesn't directly support MCP servers, but you can enhance your AL development by:

1. **Install this MCP server** following the setup below
2. **Use Claude Code alongside Copilot** for the best experience:
   - Copilot for general code completion
   - Claude Code + AL MCP for AL-specific insights and business logic assistance

### Cursor IDE

1. **Install Cursor** from [cursor.sh](https://cursor.sh)
2. **Configure MCP servers** in Cursor settings:
   - Go to Settings → Features → Model Context Protocol
   - Add the AL MCP Server configuration:
```json
{
  "al": {
    "command": "node",
    "args": ["/absolute/path/to/al-mcp-server/dist/index.js"]
  }
}
```

### Continue (VS Code Extension)

1. **Install Continue** from VS Code marketplace
2. **Configure in Continue settings** (`~/.continue/config.json`):
```json
{
  "mcpServers": {
    "al": {
      "command": "node", 
      "args": ["/absolute/path/to/al-mcp-server/dist/index.js"]
    }
  }
}
```

### Cody (Sourcegraph)

1. **Install Cody** VS Code extension
2. **Add MCP server configuration**:
```json
{
  "cody.mcpServers": {
    "al": {
      "command": "node",
      "args": ["/absolute/path/to/al-mcp-server/dist/index.js"]
    }
  }
}
```

### Universal Setup Steps (All Assistants)

1. **Clone and build** this repository:
```bash
git clone <repository-url>
cd al-mcp-server
npm install
npm run build
```

2. **Install AL CLI tools**:
```bash
dotnet tool install -g Microsoft.Dynamics.AL.Tools
```

3. **Test the server** works:
```bash
node dist/index.js
# Should show: AL MCP Server started successfully
```

4. **Update the path** in your configuration to the absolute path where you cloned the repository

### 🎯 Quick Test

After setup, test with any compatible assistant:
```
Can you search for Customer tables in my AL project?
```

The assistant should now have access to 9 AL-specific tools for comprehensive Business Central development assistance!

## 🎯 Overview

This MCP server provides Claude Code and other AI tools with deep semantic understanding of AL codebases through symbol-based analysis of AL packages (.app files). It enables intelligent code assistance, cross-project dependency resolution, and architectural analysis for Business Central development.

## ✨ Features

### Core AL Symbol Discovery
- **Search AL objects** across all loaded packages by pattern, type, or package
- **Get complete object definitions** with fields, procedures, properties, and dependencies
- **Find references** to objects across the entire codebase
- **Auto-discovery** of .alpackages directories
- **Cross-platform support** (Windows, macOS, Linux)

### Performance Optimized
- **Streaming JSON parsing** for large symbol files (Base Application: 50MB+)
- **In-memory indices** for sub-100ms query response times
- **Incremental loading** - only reprocess changed packages
- **Memory efficient** - handles enterprise AL solutions

### AI-Friendly Analysis
- **Business domain classification** (Sales, Finance, Inventory, etc.)
- **Extension relationship tracking** 
- **Dependency graph analysis**
- **Symbol conflict resolution**

## 🚀 Quick Start

### Prerequisites

1. **AL CLI Tools** - Install Microsoft AL command line tools:
   ```bash
   dotnet tool install -g Microsoft.Dynamics.AL.Tools
   ```

2. **Node.js** - Version 18 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/al-mcp-server
cd al-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

### Usage Examples

Once configured with your coding assistant, you can interact naturally:

**Search for objects:**
```
"Show me all Customer-related tables in my AL project"
"Find codeunits that handle posting procedures"
"What interfaces are available for inventory management?"
```

**Get detailed information:**
```
"Show me the complete definition of the Customer table"
"What fields does the Sales Header table have?"  
"List all procedures in the Sales-Post codeunit"
```

**Analyze relationships:**
```
"What objects extend the Item table?"
"Find all tables that reference the Customer table"
"Show me the dependency graph for my extension"
```

The assistant will automatically:
- Auto-discover AL packages in your workspace
- Load and index all available symbols  
- Provide intelligent responses based on your actual AL codebase

## 🛠 Available MCP Tools

### Core Search & Discovery

#### `al_search_objects`
Search AL objects across loaded packages.

**Parameters:**
- `pattern` (required): Search pattern with wildcard support (`Customer*`, `*Ledger*`)
- `objectType` (optional): Filter by type (`Table`, `Page`, `Codeunit`, etc.)
- `packageName` (optional): Filter by package name
- `includeFields` (optional): Include field definitions for tables
- `includeProcedures` (optional): Include procedure definitions

#### `al_get_object_definition`
Get complete object definition with all metadata.

**Parameters:**
- `objectId` (required): Object ID (e.g., `18` for Customer table)
- `objectType` (required): Object type (`Table`, `Page`, etc.)
- `packageName` (optional): Package name for conflict resolution

#### `al_find_references`
Find objects that reference a target object.

**Parameters:**
- `targetName` (required): Name of target object
- `referenceType` (optional): Type of reference (`extends`, `uses`, `table_relation`)
- `sourceType` (optional): Filter by source object type

### Package Management

#### `al_load_packages`
Load AL packages from specified directory.

**Parameters:**
- `packagesPath` (required): Path to directory containing .app files
- `forceReload` (optional): Force reload even if already loaded

#### `al_auto_discover`
Auto-discover and load packages from .alpackages directories.

**Parameters:**
- `rootPath` (optional): Root path to search (defaults to current directory)

#### `al_list_packages`
List currently loaded packages and their statistics.

### Advanced Analysis

#### `al_search_by_domain`
Search objects by business domain.

**Parameters:**
- `domain` (required): Business domain (`Sales`, `Finance`, `Inventory`, etc.)
- `objectTypes` (optional): Filter by object types

#### `al_get_extensions`
Get objects that extend a base object.

**Parameters:**
- `baseObjectName` (required): Name of base object

#### `al_get_stats`
Get database statistics and performance metrics.

## 📊 Performance Benchmarks

| Operation | Target Time | Memory Impact |
|-----------|-------------|---------------|
| Load Base Application | < 10 seconds | < 200MB |
| Simple object search | < 50ms | Minimal |
| Complex wildcard search | < 100ms | Minimal |
| Get object definition | < 10ms | Minimal |

## 🏗 Architecture

```
AL MCP Server (Node.js/TypeScript)
├── AL CLI Integration (symbol extraction from .app files)
├── Streaming Symbol Parser (handle 50MB+ JSON files)
├── In-Memory Indices (optimized for fast queries)
├── MCP Protocol Handler (JSON-RPC communication)
└── Auto-discovery (smart .alpackages detection)
```

### Key Components

- **ALCliWrapper**: Interface with Microsoft AL command line tools
- **StreamingSymbolParser**: Memory-efficient parsing of large symbol files
- **OptimizedSymbolDatabase**: High-performance in-memory indices
- **ALPackageManager**: Package discovery and loading orchestration
- **ALMCPTools**: MCP protocol tool implementations

## 🧪 Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Development Mode

```bash
# Start in development mode with hot reload
npm run dev
```

### Building

```bash
# Clean and build
npm run clean && npm run build

# Start production build
npm start
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Write** tests for your changes
4. **Ensure** all tests pass
5. **Submit** a pull request

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Follow the configured rules
- **Jest**: Write comprehensive tests
- **Conventional Commits**: Use conventional commit messages

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Microsoft** - For AL language tools and Business Central platform
- **Model Context Protocol** - For the foundation of AI tool integration
- **Claude Code** - For inspiring better AI-assisted development

---

**Transform your AL development with AI-powered code assistance!** 🚀