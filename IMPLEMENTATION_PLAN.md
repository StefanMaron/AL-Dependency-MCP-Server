# AL MCP Server Implementation Plan

## 🎯 Project Goals

Build a **high-performance, cross-platform AL MCP server** that provides semantic understanding of AL codebases to AI tools like Claude Code, focusing on:

- **Performance**: Handle Microsoft Base Application (50MB+ symbol files) without slowdown
- **Completeness**: Parse ALL AL symbol data (objects, fields, procedures, properties, dependencies)
- **Usability**: Auto-discovery and seamless integration with existing AL development workflows
- **Cross-platform**: Works on Windows, macOS, Linux using Node.js/TypeScript

## 📋 Technical Requirements

### Performance Requirements
- **Parse Base Application symbols** in < 10 seconds on modern hardware
- **Memory usage** < 500MB for typical AL workspace (Base App + 5-10 extensions)
- **Query response time** < 100ms for object searches and definitions
- **Incremental loading** - only reprocess changed packages
- **Streaming JSON parsing** for large SymbolReference.json files

### Completeness Requirements
- **All AL object types**: Tables, Pages, Codeunits, Reports, Enums, Interfaces, etc.
- **Complete field metadata**: Data types, properties, table relations, validation
- **Procedure signatures**: Parameters, return types, access levels, attributes
- **Dependency resolution**: Cross-package symbol resolution and inheritance
- **Extension relationships**: Track which objects extend/modify base objects

### Usability Requirements
- **Auto-discovery**: Automatically find and load .alpackages directories
- **File system monitoring**: Detect new/changed .app files and reload symbols
- **Error handling**: Graceful handling of corrupted packages or parsing errors
- **Progress feedback**: Show loading progress for large symbol sets
- **Multi-workspace**: Support multiple AL projects simultaneously

## 🏗 Architecture Overview

```
AL MCP Server (Node.js/TypeScript)
├── ALPackageManager
│   ├── PackageDiscovery (auto-find .alpackages)
│   ├── SymbolExtractor (AL CLI integration)
│   └── FileSystemWatcher (monitor changes)
├── ALSymbolParser
│   ├── StreamingJSONParser (handle large files)
│   ├── TypeDefinitionParser (AL data types)
│   └── ReferenceResolver (cross-package symbols)
├── ALSymbolDatabase
│   ├── InMemoryIndices (fast O(1) lookups)
│   ├── ObjectIndex, FieldIndex, ProcedureIndex
│   └── PackageIndex, DependencyGraph
├── MCPToolsHandler
│   ├── SearchObjectsTool
│   ├── GetObjectDefinitionTool
│   └── FindReferencesTool
└── MCPServer (Protocol implementation)
```

## 📦 Phase 1: Core Symbol Processing (MVP)

### 1.1 Project Setup
```bash
# Create Node.js/TypeScript project
npm init -y
npm install @modelcontextprotocol/sdk
npm install --dev typescript @types/node ts-node
npm install sqlite3 @types/sqlite3  # Optional persistence
npm install glob fast-glob          # File discovery
npm install stream-json             # Streaming JSON parser
```

### 1.2 AL CLI Integration
```typescript
// src/al-cli.ts - Wrapper for AL command line tool
export class ALCliWrapper {
  async extractSymbols(appPath: string): Promise<string> {
    // Create temp symbol package
    const symbolPath = path.join(tmpdir(), `symbols_${Date.now()}.app`);
    
    // Run: AL CreateSymbolPackage input.app symbols.app
    await this.executeALCommand('CreateSymbolPackage', [appPath, symbolPath]);
    
    return symbolPath;
  }
  
  async getPackageManifest(appPath: string): Promise<ALAppManifest> {
    // Run: AL GetPackageManifest input.app
    const manifestJson = await this.executeALCommand('GetPackageManifest', [appPath]);
    return JSON.parse(manifestJson);
  }
  
  private async executeALCommand(command: string, args: string[]): Promise<string> {
    // Spawn AL process with proper error handling
    // Handle cross-platform differences
  }
}
```

### 1.3 Streaming JSON Parser
```typescript
// src/symbol-parser.ts - Parse large SymbolReference.json files
export class ALSymbolParser {
  async parseSymbolReference(symbolsZipPath: string): Promise<ALSymbolDatabase> {
    // 1. Extract SymbolReference.json from ZIP
    const symbolsJson = await this.extractSymbolsJson(symbolsZipPath);
    
    // 2. Stream parse JSON to handle large files (50MB+)
    const stream = StreamValues.withParser();
    const objects: ALObject[] = [];
    
    // 3. Process objects as they're parsed (memory efficient)
    stream.on('data', (data) => {
      if (data.key === 'Tables') {
        this.processTables(data.value, objects);
      } else if (data.key === 'Pages') {
        this.processPages(data.value, objects);
      }
      // ... handle all object types
    });
    
    // 4. Build indices incrementally
    return this.buildDatabase(objects);
  }
  
  private processTables(tables: any[], objects: ALObject[]) {
    for (const table of tables) {
      objects.push(this.parseTable(table));
    }
  }
}
```

### 1.4 In-Memory Indices
```typescript
// src/symbol-database.ts - High-performance symbol storage
export class ALSymbolDatabase {
  // Primary lookup indices
  private objectsByName = new Map<string, ALObject[]>();      // "Customer" -> [Table, Page, ...]
  private objectsById = new Map<string, ALObject>();          // "Table:18" -> Customer table
  private objectsByType = new Map<string, ALObject[]>();      // "Table" -> [all tables]
  
  // Secondary indices for advanced queries
  private fieldsByTable = new Map<string, ALField[]>();       // "Customer" -> [all fields]
  private proceduresByObject = new Map<string, ALProcedure[]>(); // "Customer" -> [procedures]
  private extensionsByBase = new Map<string, ALObject[]>();   // "Customer" -> [extensions]
  
  // Package and dependency indices
  private packageObjects = new Map<string, Set<string>>();    // Package -> object IDs
  private dependencyGraph = new Map<string, string[]>();      // Package -> dependencies
  
  // Core indexing method
  indexObject(object: ALObject, packageName: string) {
    const key = `${object.Type}:${object.Id}`;
    
    // Primary indices
    this.objectsById.set(key, object);
    this.addToMapArray(this.objectsByName, object.Name.toLowerCase(), object);
    this.addToMapArray(this.objectsByType, object.Type, object);
    
    // Package tracking
    if (!this.packageObjects.has(packageName)) {
      this.packageObjects.set(packageName, new Set());
    }
    this.packageObjects.get(packageName)!.add(key);
    
    // Type-specific indexing
    if (object.Type === 'Table' && object.Fields) {
      this.fieldsByTable.set(object.Name, object.Fields);
    }
    if (object.Procedures) {
      this.proceduresByObject.set(object.Name, object.Procedures);
    }
  }
  
  // Fast search methods
  searchObjects(pattern: string, type?: string, packageName?: string): ALObject[] {
    const normalizedPattern = pattern.toLowerCase();
    
    // Start with name-based lookup
    let candidates: ALObject[] = [];
    
    if (pattern.includes('*')) {
      // Wildcard search - iterate through all names
      const regex = new RegExp(normalizedPattern.replace(/\*/g, '.*'));
      for (const [name, objects] of this.objectsByName) {
        if (regex.test(name)) {
          candidates.push(...objects);
        }
      }
    } else {
      // Exact or partial match
      for (const [name, objects] of this.objectsByName) {
        if (name.includes(normalizedPattern)) {
          candidates.push(...objects);
        }
      }
    }
    
    // Apply filters
    if (type) {
      candidates = candidates.filter(obj => obj.Type === type);
    }
    if (packageName) {
      const packageObjIds = this.packageObjects.get(packageName);
      if (packageObjIds) {
        candidates = candidates.filter(obj => 
          packageObjIds.has(`${obj.Type}:${obj.Id}`)
        );
      }
    }
    
    return candidates;
  }
}
```

### 1.5 MCP Tools Implementation
```typescript
// src/mcp-tools.ts - Implement MCP protocol tools
export class ALMCPTools {
  constructor(private database: ALSymbolDatabase) {}
  
  async searchObjects(args: {
    pattern: string;
    objectType?: string;
    packageName?: string;
    includeFields?: boolean;
    includeProcedures?: boolean;
  }): Promise<ALObject[]> {
    const results = this.database.searchObjects(
      args.pattern, 
      args.objectType, 
      args.packageName
    );
    
    // Enrich with additional data if requested
    if (args.includeFields || args.includeProcedures) {
      for (const obj of results) {
        if (args.includeFields && obj.Type === 'Table') {
          obj.Fields = this.database.getTableFields(obj.Name);
        }
        if (args.includeProcedures) {
          obj.Procedures = this.database.getObjectProcedures(obj.Name);
        }
      }
    }
    
    return results;
  }
  
  async getObjectDefinition(args: {
    objectId: number;
    objectType: string;
    packageName?: string;
  }): Promise<ALObjectDefinition> {
    const key = `${args.objectType}:${args.objectId}`;
    const object = this.database.getObjectById(key);
    
    if (!object) {
      throw new Error(`Object not found: ${args.objectType} ${args.objectId}`);
    }
    
    // Return complete definition with all metadata
    return {
      ...object,
      Fields: this.database.getTableFields(object.Name),
      Procedures: this.database.getObjectProcedures(object.Name),
      Keys: this.database.getTableKeys(object.Name),
      Dependencies: this.database.getObjectDependencies(object.Name)
    };
  }
  
  async findReferences(args: {
    targetName: string;
    referenceType?: string;
    sourceType?: string;
  }): Promise<ALReference[]> {
    return this.database.findReferences(
      args.targetName,
      args.referenceType,
      args.sourceType
    );
  }
}
```

## 📊 Phase 2: Performance & Scale Optimizations

### 2.1 Memory Management Strategy
```typescript
// Lazy loading for large codebases
export class LazyLoadingDatabase extends ALSymbolDatabase {
  private loadedPackages = new Set<string>();
  private packagePaths = new Map<string, string>();
  
  async searchObjects(pattern: string, type?: string, packageName?: string): Promise<ALObject[]> {
    // Ensure required packages are loaded
    if (packageName && !this.loadedPackages.has(packageName)) {
      await this.loadPackage(packageName);
    }
    
    // If no specific package, load all discovered packages
    if (!packageName) {
      await this.loadAllPackages();
    }
    
    return super.searchObjects(pattern, type, packageName);
  }
  
  private async loadPackage(packageName: string) {
    if (this.loadedPackages.has(packageName)) return;
    
    const packagePath = this.packagePaths.get(packageName);
    if (packagePath) {
      const symbols = await this.symbolParser.parsePackage(packagePath);
      this.indexPackageSymbols(symbols, packageName);
      this.loadedPackages.add(packageName);
    }
  }
}
```

### 2.2 Incremental Loading
```typescript
// Track package modification times and only reload changed packages
export class IncrementalPackageManager {
  private packageHashes = new Map<string, string>();
  
  async checkForChanges(packagesPath: string): Promise<string[]> {
    const currentPackages = await glob('*.app', { cwd: packagesPath });
    const changedPackages: string[] = [];
    
    for (const packageFile of currentPackages) {
      const fullPath = path.join(packagesPath, packageFile);
      const stats = await fs.stat(fullPath);
      const currentHash = `${stats.mtime.getTime()}-${stats.size}`;
      
      const previousHash = this.packageHashes.get(packageFile);
      if (previousHash !== currentHash) {
        changedPackages.push(fullPath);
        this.packageHashes.set(packageFile, currentHash);
      }
    }
    
    return changedPackages;
  }
}
```

### 2.3 Parallel Processing
```typescript
// Process multiple packages in parallel
export class ParallelSymbolProcessor {
  async processPackages(packagePaths: string[]): Promise<ALSymbolDatabase[]> {
    const maxConcurrency = Math.min(4, os.cpus().length); // Limit concurrent processing
    const semaphore = new Semaphore(maxConcurrency);
    
    const results = await Promise.all(
      packagePaths.map(async (path) => {
        await semaphore.acquire();
        try {
          return await this.processPackage(path);
        } finally {
          semaphore.release();
        }
      })
    );
    
    return results;
  }
}
```

## 🔍 Phase 3: Advanced Querying Features

### 3.1 Dependency Graph Analysis
```typescript
// Build and query dependency relationships
export class DependencyAnalyzer {
  buildDependencyGraph(packages: ALPackageInfo[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const pkg of packages) {
      graph.set(pkg.name, pkg.dependencies.map(dep => dep.name));
    }
    
    return graph;
  }
  
  findDependents(packageName: string): string[] {
    // Find packages that depend on this package
    const dependents: string[] = [];
    for (const [pkg, deps] of this.dependencyGraph) {
      if (deps.includes(packageName)) {
        dependents.push(pkg);
      }
    }
    return dependents;
  }
  
  getTransitiveDependencies(packageName: string): string[] {
    // Get all dependencies (direct + indirect)
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (pkg: string) => {
      if (visited.has(pkg)) return;
      visited.add(pkg);
      
      const deps = this.dependencyGraph.get(pkg) || [];
      for (const dep of deps) {
        result.push(dep);
        visit(dep);
      }
    };
    
    visit(packageName);
    return [...new Set(result)]; // Remove duplicates
  }
}
```

### 3.2 Cross-Reference Tracking
```typescript
// Track usage relationships between objects
export class CrossReferenceAnalyzer {
  analyzeReferences(symbols: ALSymbolDatabase): Map<string, ALReference[]> {
    const references = new Map<string, ALReference[]>();
    
    // Analyze table relations in field properties
    for (const table of symbols.getObjectsByType('Table')) {
      for (const field of table.Fields || []) {
        const tableRelation = this.extractTableRelation(field.Properties);
        if (tableRelation) {
          this.addReference(references, table.Name, tableRelation, 'table_relation');
        }
      }
    }
    
    // Analyze page source tables
    for (const page of symbols.getObjectsByType('Page')) {
      const sourceTable = this.extractSourceTable(page.Properties);
      if (sourceTable) {
        this.addReference(references, page.Name, sourceTable, 'source_table');
      }
    }
    
    // Analyze extension relationships
    for (const obj of symbols.getAllObjects()) {
      const extendsProperty = this.findProperty(obj.Properties, 'Extends');
      if (extendsProperty) {
        this.addReference(references, obj.Name, extendsProperty.Value, 'extends');
      }
    }
    
    return references;
  }
}
```

## 🚀 Phase 4: AI Integration & Advanced Features

### 4.1 Context-Aware Responses
```typescript
// Provide rich context for AI tools
export class AIContextProvider {
  async getObjectContext(objectName: string): Promise<ALObjectContext> {
    const object = await this.database.findObject(objectName);
    if (!object) return null;
    
    return {
      object,
      relatedObjects: await this.findRelatedObjects(objectName),
      usageExamples: await this.findUsagePatterns(objectName),
      businessDomain: this.classifyBusinessDomain(object),
      dependencies: await this.getDependencies(objectName),
      extensions: await this.findExtensions(objectName)
    };
  }
  
  private classifyBusinessDomain(object: ALObject): string {
    // Use object name patterns to classify business domains
    const name = object.Name.toLowerCase();
    
    if (name.includes('customer') || name.includes('sales')) return 'Sales';
    if (name.includes('vendor') || name.includes('purchase')) return 'Purchasing';
    if (name.includes('item') || name.includes('inventory')) return 'Inventory';
    if (name.includes('gl') || name.includes('ledger')) return 'Finance';
    
    return 'General';
  }
}
```

### 4.2 Performance Monitoring
```typescript
// Monitor and optimize performance
export class PerformanceMonitor {
  private metrics = {
    packageLoadTime: new Map<string, number>(),
    queryResponseTime: new Map<string, number[]>(),
    memoryUsage: [] as number[]
  };
  
  recordPackageLoadTime(packageName: string, timeMs: number) {
    this.metrics.packageLoadTime.set(packageName, timeMs);
  }
  
  recordQueryTime(queryType: string, timeMs: number) {
    if (!this.metrics.queryResponseTime.has(queryType)) {
      this.metrics.queryResponseTime.set(queryType, []);
    }
    this.metrics.queryResponseTime.get(queryType)!.push(timeMs);
  }
  
  getPerformanceReport(): PerformanceReport {
    return {
      averageLoadTime: this.calculateAverage(this.metrics.packageLoadTime),
      averageQueryTimes: this.calculateQueryAverages(),
      memoryUsage: process.memoryUsage(),
      packageCount: this.metrics.packageLoadTime.size
    };
  }
}
```

## 📋 Implementation Checklist

### Phase 1 Tasks (MVP)
- [ ] Set up Node.js/TypeScript project structure
- [ ] Implement AL CLI wrapper for symbol extraction
- [ ] Create streaming JSON parser for large SymbolReference.json files
- [ ] Build in-memory indices for fast object lookup
- [ ] Implement core MCP tools (search, get definition)
- [ ] Add auto-discovery of .alpackages directories
- [ ] Create comprehensive unit tests

### Phase 2 Tasks (Performance)
- [ ] Implement lazy loading for large codebases
- [ ] Add incremental loading with change detection
- [ ] Optimize memory usage for Base Application
- [ ] Add parallel processing for multiple packages
- [ ] Implement file system watching
- [ ] Add progress reporting for long operations

### Phase 3 Tasks (Advanced Features)
- [ ] Build dependency graph analyzer
- [ ] Implement cross-reference tracking
- [ ] Add business domain classification
- [ ] Create extension relationship tracking
- [ ] Implement symbol conflict resolution
- [ ] Add impact analysis capabilities

### Phase 4 Tasks (AI Integration)
- [ ] Enhance context for AI responses
- [ ] Add performance monitoring and optimization
- [ ] Implement multi-workspace support
- [ ] Create advanced query capabilities
- [ ] Add code generation templates
- [ ] Optimize for Claude Code integration

## 🎯 Success Criteria

### Performance Benchmarks
- **Base Application loading**: < 10 seconds
- **Memory usage**: < 500MB for typical workspace
- **Query response**: < 100ms average
- **Incremental reload**: < 2 seconds for single package

### Functional Requirements
- **Object coverage**: 100% of AL object types supported
- **Symbol completeness**: All fields, procedures, properties indexed
- **Cross-platform**: Works on Windows, macOS, Linux
- **Error handling**: Graceful handling of edge cases

### Integration Success
- **Claude Code compatibility**: Seamless MCP integration
- **Auto-discovery**: No manual configuration required
- **Developer experience**: Instant, helpful responses
- **Scalability**: Handles enterprise AL solutions

This implementation plan provides a clear roadmap for building a production-ready AL MCP server that meets all performance, completeness, and usability requirements.