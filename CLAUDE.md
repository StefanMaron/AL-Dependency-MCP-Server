# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
```bash
# Build TypeScript to JavaScript
npm run build

# Run in development mode with ts-node
npm run dev

# Start the compiled server
npm start

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run tests with coverage
npm test:coverage
```

### AL Tools Management
```bash
# Setup AL tools and verify installation
npm run setup

# Install Microsoft AL CLI tools
npm run install-al

# Check AL CLI version
npm run check-al
```

## Architecture Overview

This is an MCP (Model Context Protocol) server that provides AI assistants with intelligent AL (Application Language) code analysis for Microsoft Dynamics 365 Business Central development.

### Core Architecture Components

**Main Server (`src/index.ts`):**
- `ALMCPServer` class - Main MCP server implementation with lazy initialization
- Handles MCP protocol communication via stdio transport
- Auto-discovers and loads AL packages on first tool call for optimal performance

**Symbol Database (`src/core/symbol-database.ts`):**
- `OptimizedSymbolDatabase` - In-memory database with O(1) lookups via multiple indices
- Primary indices: by name, type, ID
- Secondary indices: fields by table, procedures by object, extensions by base
- Designed for sub-100ms query response times

**Package Management (`src/core/package-manager.ts`):**
- `ALPackageManager` - Discovers and loads .app symbol files
- Auto-discovery strategy: searches .alpackages directories and VS Code settings
- Filters to latest package versions to avoid duplicates

**Symbol Parsing (`src/parser/streaming-parser.ts`):**
- `StreamingSymbolParser` - Handles large symbol files (50MB+) efficiently
- Uses streaming JSON parsing to avoid memory issues
- Falls back to ZIP extraction for problematic AL packages

**MCP Tools (`src/tools/mcp-tools.ts`):**
- `ALMCPTools` - Implements all MCP tool endpoints
- Token-optimized responses with summary modes
- Pagination support for large result sets

**AL CLI Integration (`src/cli/`):**
- `ALCliWrapper` - Interfaces with Microsoft AL CLI tools
- `ALInstaller` - Cross-platform installation of AL tools
- Handles symbol extraction from .app packages

### Package Discovery Strategy

The server uses a targeted discovery approach to avoid system-wide scanning:

1. **Primary**: Search for `.alpackages` directories (current directory + 2 levels deep)
2. **Fallback**: Check VS Code AL extension settings (`al.packageCachePath`)
3. **Security**: Skips system directories, limits search depth, restricts to current working tree

### Performance Optimizations

- **Lazy initialization**: AL packages loaded only on first tool call
- **Streaming parsing**: Handles large Base Application symbols (50MB+)
- **In-memory indexing**: Multiple optimized indices for fast queries
- **Summary modes**: Token-efficient responses (96% reduction vs full definitions)
- **Version filtering**: Uses only latest version of each package

## Key File Structure

```
src/
├── index.ts              # Main MCP server entry point
├── core/
│   ├── symbol-database.ts    # Optimized in-memory database
│   └── package-manager.ts    # AL package discovery and loading
├── tools/
│   └── mcp-tools.ts      # MCP tool implementations
├── parser/
│   ├── streaming-parser.ts   # Efficient symbol parsing
│   └── zip-fallback.ts   # ZIP extraction fallback
├── cli/
│   ├── al-cli.ts         # AL CLI wrapper
│   └── al-installer.ts   # Cross-platform AL tool installation
└── types/
    ├── al-types.ts       # AL object type definitions
    └── mcp-types.ts      # MCP tool argument/response types
```

## Development Workflow

### Adding New MCP Tools

1. **Define types** in `src/types/mcp-types.ts` for arguments and responses
2. **Implement tool logic** in `src/tools/mcp-tools.ts`
3. **Register tool** in `src/index.ts` within the `ListToolsRequestSchema` handler
4. **Add tool handler** in the `CallToolRequestSchema` handler
5. **Write tests** using the existing test pattern in root directory test files

### Testing Strategy

The project includes comprehensive test files in the root directory:
- `test-*.js` files for various scenarios (symbol parsing, database content, large objects)
- Jest configuration for unit testing in `tests/` directory
- Coverage reporting enabled

### Performance Considerations

- **Token optimization**: Use summary modes and limits to prevent large AI context
- **Memory efficiency**: Streaming parser prevents loading entire files into memory
- **Query optimization**: Multiple indices provide O(1) lookups for common queries
- **Lazy loading**: Packages loaded only when needed, not on server startup

### AL Package Requirements

- Works with **compiled AL packages** (.app files) containing symbol information
- Requires **.alpackages directories** or individual .app files
- Does **not analyze raw .al source files** - only compiled symbols
- Supports both modern namespace packages and legacy non-namespace packages

## Specialized Development Agents

This project includes specialized Claude Code agents for different development tasks. These agents provide domain-specific expertise and are available in the `.claude/agents/` directory:

### Available Agents

**Core Development:**
- **mcp-protocol-agent** - MCP protocol development, tool definitions, and request/response handling
- **al-symbol-agent** - AL symbol parsing, database operations, and AL object type handling
- **package-discovery-agent** - AL package management, .alpackages discovery, and VS Code integration
- **performance-optimization-agent** - Memory optimization, streaming parsing, and query performance

**Quality & Maintenance:**
- **cross-platform-agent** - Platform compatibility, AL CLI integration, and OS-specific handling  
- **mcp-tool-evaluator** - MCP tool design evaluation, documentation quality, and user experience
- **test-automation-agent** - Automated testing, test coverage, and CI/CD setup
- **documentation-agent** - Documentation maintenance, user guides, and API documentation

### Using the Agents

Each agent contains specialized knowledge about:
- Relevant project files and architecture patterns
- Domain-specific best practices (AL/Business Central concepts)
- Performance requirements and optimization strategies
- Testing approaches and quality standards

To use an agent, reference it in your Claude Code session when working on related tasks. The agents will provide focused expertise while maintaining awareness of the project's overall architecture and requirements.

## Important Notes

- The server auto-installs AL CLI tools but may require manual intervention on some platforms
- Package discovery is intentionally limited to prevent system-wide disk scanning
- All responses are JSON-formatted for MCP protocol compatibility
- Error handling preserves server functionality even when AL tools are unavailable
- Just mention issues in the commit message, never close them