# AL MCP Server

**Model Context Protocol (MCP) server providing intelligent AL (Application Language) code assistance for Microsoft Dynamics 365 Business Central development.**

## 🚀 Quick Installation

### One-Command Install (Recommended)

```bash
npx al-mcp-server
```

This single command will:
- ✅ Install AL CLI tools (if not present)
- ✅ Configure Claude Code automatically
- ✅ Configure VS Code MCP settings
- ✅ Show manual configuration for other editors

### Manual Installation for Coding Assistants

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

### GitHub Copilot (VS Code) - MCP Server Support

GitHub Copilot now supports MCP servers! Configure the AL MCP Server for enhanced AL development:

**Option 1: Workspace Configuration (Recommended)**
1. **Create `.vscode/mcp.json`** in your AL project root:
```json
{
  "servers": {
    "al": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/al-mcp-server/dist/index.js"]
    }
  }
}
```

**Option 2: User Profile Configuration**
1. **Create `mcp.json`** in your user profile directory
2. **Add the AL server configuration** (same JSON format as above)

**Option 3: Dev Container Configuration**
- Add MCP server configuration to your `devcontainer.json`
- Servers will be available in containerized development environments

**Usage with GitHub Copilot:**
- Enable agent mode in Copilot Chat
- Select available AL tools from the MCP server
- Copilot will use AL-specific context for better code assistance

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

### Universal Setup Steps (Manual Installation)

If you prefer manual installation or the automatic installer didn't work:

1. **Clone and build** this repository:
```bash
git clone https://github.com/StefanMaron/AL-Dependency-MCP-Server.git
cd AL-Dependency-MCP-Server
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

Once configured with your coding assistant, you can interact naturally using token-efficient approaches:

**🎯 Smart Object Discovery:**
```
"Show me Customer tables" → Uses al_search_objects with smart limits
"What functions does the Sales-Post codeunit have?" → Uses al_get_object_summary (96% token reduction!)
"Find posting codeunits" → Uses al_search_by_domain for business-focused results
```

**🔍 Detailed Analysis (When Needed):**
```
"Show me the Customer table structure" → Uses al_get_object_definition with summaryMode
"What validation procedures are in Item table?" → Uses al_search_procedures with pattern filtering
"List fields containing 'Code' in Sales Header" → Uses al_search_fields with targeted patterns
```

**🔗 Relationship Analysis:**
```
"What objects extend the Item table?" → Uses al_get_extensions
"Find tables that reference Customer" → Uses al_find_references
"Show me package statistics" → Uses al_get_stats for overview
```

**✅ The assistant will now automatically:**
- Choose the most token-efficient tool for each question
- Auto-discover AL packages in your workspace
- Load and index all available symbols with optimized responses
- Provide organized, categorized information instead of overwhelming data dumps

## 🛠 Available MCP Tools

### 🎯 Quick Reference - When to Use Which Tool

| **For This Question** | **Use This Tool** | **Why** |
|---|---|---|
| "What functions does the Sales-Post codeunit have?" | `al_get_object_summary` | ✅ Organized, categorized view (< 1K tokens) |
| "Show me all Customer tables" | `al_search_objects` | ✅ Fast search with summaryMode |
| "Find a specific table definition" | `al_get_object_definition` | ✅ Complete details for single object |
| "List procedures in MyCodeunit" | `al_search_procedures` | ✅ Targeted procedure search |

### ⚠️ Token Usage Guidelines

**Large Response Warning:** Some tools can generate very large responses (10K+ tokens) that may exceed AI context limits. Always use the most specific tool for your needs.

**Recommended Approach:**
1. **Start with summary tools** (`al_get_object_summary`, `summaryMode: true`)
2. **Use filters and limits** (`limit`, `offset`, `objectType`)
3. **Search specifically** (exact names vs wildcards)
4. **Drill down gradually** (summary → specific details)

### 🔍 Object Search & Discovery

#### `al_search_objects` ⚠️ **Can generate large responses**
Search AL objects across loaded packages.

**⚠️ TOKEN WARNING:** Without limits, this can return 10K+ tokens. Use `summaryMode: true` and `limit` parameter.

**Parameters:**
- `pattern` (required): Search pattern with wildcard support (`Customer*`, `*Ledger*`)
- `objectType` (optional): Filter by type (`Table`, `Page`, `Codeunit`, etc.)
- `packageName` (optional): Filter by package name
- `limit` (optional): Maximum results to return (recommended: 20)
- `summaryMode` (optional): Return condensed view (recommended: true)
- `includeFields` (optional): Include field definitions for tables ⚠️ **Increases tokens significantly**
- `includeProcedures` (optional): Include procedure definitions ⚠️ **Increases tokens significantly**

#### `al_get_object_summary` ✅ **Optimized for large objects**
Get intelligent summary of AL objects with categorized procedures/functions.

**✅ TOKEN EFFICIENT:** Designed for complex objects like Sales-Post (600+ procedures) - returns organized categories instead of raw lists.

**Parameters:**
- `objectName` (required): Name of the object to summarize
- `objectType` (optional): Type for disambiguation (`Table`, `Page`, `Codeunit`, etc.)

**Best for:** Understanding complex codeunits, getting function overviews, categorized procedure lists

#### `al_get_object_definition` ⚠️ **Can be large for complex objects**
Get complete object definition with all metadata.

**Parameters:**
- `objectId` or `objectName` (required): Object identifier
- `objectType` (required): Object type (`Table`, `Page`, etc.)
- `packageName` (optional): Package name for conflict resolution
- `summaryMode` (optional): Return condensed view (recommended: true for large objects)
- `includeProcedures` (optional): Include procedure definitions ⚠️ **Can be very large**
- `includeFields` (optional): Include field definitions
- `procedureLimit` (optional): Limit procedures returned (recommended: 20)

#### `al_find_references`
Find objects that reference a target object.

**Parameters:**
- `targetName` (required): Name of target object
- `referenceType` (optional): Type of reference (`extends`, `uses`, `table_relation`)
- `sourceType` (optional): Filter by source object type

### Package Management

#### `al_load_packages` ✅ **Setup & initialization**
Load AL packages from specified directory.

**✅ TOKEN EFFICIENT:** Returns simple confirmation and package count.

**Parameters:**
- `packagesPath` (required): Path to directory containing .app files
- `forceReload` (optional): Force reload even if already loaded (default: false)

**Best for:** Manual package loading, custom package directories

#### `al_auto_discover` ✅ **Automatic setup**
Auto-discover and load packages from .alpackages directories.

**✅ TOKEN EFFICIENT:** Returns discovery results and loaded package summary.

**Parameters:**
- `rootPath` (optional): Root path to search (defaults to current directory)

**Best for:** Initial setup, workspace discovery, finding standard AL packages

#### `al_list_packages` ✅ **Quick overview**
List currently loaded packages and their statistics.

**✅ TOKEN EFFICIENT:** Compact list with object counts per package.

**No parameters required** - shows all loaded packages with their object counts and versions.

### 🔍 Detailed Search Within Objects

#### `al_search_procedures` ✅ **Targeted search**
Search procedures within a specific AL object.

**Parameters:**
- `objectName` (required): Name of the object to search in
- `objectType` (optional): Type for disambiguation (`Codeunit`, `Table`, etc.)
- `procedurePattern` (optional): Pattern to filter procedures (`*Post*`, `Validate*`)
- `limit` (optional): Maximum procedures to return (default: 20)
- `includeDetails` (optional): Include full procedure details (default: true)

#### `al_search_fields` ✅ **Targeted search**
Search fields within a specific table.

**Parameters:**
- `objectName` (required): Name of the table to search in
- `fieldPattern` (optional): Pattern to filter fields (`*Code*`, `*Date`)
- `limit` (optional): Maximum fields to return (default: 20)
- `includeDetails` (optional): Include full field details (default: true)

#### `al_search_controls` ✅ **Targeted search**
Search controls within a specific page.

**Parameters:**
- `objectName` (required): Name of the page to search in
- `controlPattern` (optional): Pattern to filter controls (`*Button*`, `*Field`)
- `limit` (optional): Maximum controls to return (default: 20)

#### `al_search_dataitems` ✅ **Targeted search**
Search data items within reports, queries, or xmlports.

**Parameters:**
- `objectName` (required): Name of the report/query/xmlport
- `dataItemPattern` (optional): Pattern to filter data items
- `limit` (optional): Maximum data items to return (default: 20)

### 📊 Advanced Analysis

#### `al_search_by_domain` ✅ **Business-focused search**
Search objects by business domain.

**Parameters:**
- `domain` (required): Business domain (`Sales`, `Finance`, `Inventory`, etc.)
- `objectTypes` (optional): Filter by object types

#### `al_get_extensions` ✅ **Relationship analysis**
Get objects that extend a base object.

**Parameters:**
- `baseObjectName` (required): Name of base object

#### `al_get_stats` ✅ **Performance metrics**
Get database statistics and performance metrics.

**No parameters required** - returns comprehensive statistics about loaded packages.

## 💡 Usage Examples with Token Guidance

### 🟢 **Recommended Patterns** (Token Efficient)

#### Understanding Complex Objects
```
Question: "What functions does the Sales-Post codeunit have?"
✅ Use: al_get_object_summary
Response: ~400 tokens with organized categories
```

#### Finding Specific Objects
```
Question: "Show me Customer tables"
✅ Use: al_search_objects with summaryMode: true, limit: 20
Response: ~800 tokens with table list
```

#### Targeted Searches
```
Question: "What validation procedures are in the Customer table?"
✅ Use: al_search_procedures with procedurePattern: "*Validate*"
Response: ~600 tokens with focused results
```

### 🔴 **Avoid These Patterns** (Token Heavy)

#### ❌ Unfiltered Broad Searches
```
❌ al_search_objects with pattern: "*" (returns all objects)
❌ al_get_object_definition with includeProcedures: true on complex objects
❌ al_search_objects with includeFields: true and includeProcedures: true
```

### 📋 **Step-by-Step Approach**

1. **Start Broad, Stay Efficient**
   ```
   al_search_objects → summaryMode: true, limit: 20
   ```

2. **Then Get Organized Summary**
   ```
   al_get_object_summary → categorized view of functions
   ```

3. **Finally Drill Down**
   ```
   al_search_procedures → specific procedure patterns
   ```

### 🎯 **Token Estimates by Tool**

| Tool | Typical Response | Large Object | With Limits |
|------|-----------------|--------------|-------------|
| `al_get_object_summary` | ~400 tokens | ~600 tokens | N/A (always optimized) |
| `al_search_objects` (summary) | ~800 tokens | ~1,500 tokens | ~500 tokens |
| `al_get_object_definition` (summary) | ~1,200 tokens | ~3,000 tokens | ~800 tokens |
| `al_search_procedures` | ~600 tokens | ~1,000 tokens | ~400 tokens |
| `al_search_objects` (detailed) | ~5,000 tokens | **15,000+ tokens** ⚠️ | ~2,000 tokens |

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

## 📦 Publishing (Maintainers)

This package uses GitHub Actions for automated publishing to npm.

### Setup (One-time)

1. **Create npm token**:
   - Go to [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate New Token
   - Choose "Automation" type for CI/CD

2. **Add to GitHub secrets**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add `NPM_TOKEN` with your npm token

### Publishing Methods

**Method 1: Manual Workflow Dispatch (Recommended)**
1. Go to repository → Actions → "Publish to npm"
2. Click "Run workflow"
3. Choose version bump: patch/minor/major
4. Workflow will automatically:
   - Run tests
   - Bump version
   - Publish to npm
   - Create GitHub release
   - Push version tag

**Method 2: GitHub Releases**
1. Create a new release with tag format `v1.2.3`
2. Workflow triggers automatically and publishes to npm

### Local Publishing (Fallback)
```bash
npm run build
npm version patch  # or minor/major
npm publish
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