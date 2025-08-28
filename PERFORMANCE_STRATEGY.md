# Performance-Optimized Symbol Parsing Strategy

## 🎯 Performance Goals

Handle Microsoft Base Application and large AL codebases efficiently:

- **Parse Base Application symbols** (50MB+ SymbolReference.json) in < 10 seconds
- **Memory usage** < 500MB for typical AL workspace
- **Query response time** < 100ms for searches and object definitions
- **Incremental loading** - only reprocess changed packages
- **Concurrent processing** of multiple packages

## 📊 Performance Analysis

### Base Application Symbol Statistics
Based on analysis of Microsoft's Base Application SymbolReference.json:

```
File Size: ~50MB (uncompressed JSON)
Objects: ~15,000 total
├── Tables: ~2,500 (with ~50,000 fields total)
├── Pages: ~8,000 (with complex control hierarchies)
├── Codeunits: ~3,000 (with ~30,000 procedures)
├── Reports: ~1,200
└── Other objects: ~300

Parsing Challenges:
- Large nested JSON structures (deep namespace hierarchies)
- Complex field definitions with extensive properties
- Procedure signatures with parameter arrays
- Cross-references between objects
- Memory allocation for large object graphs
```

### Performance Bottlenecks Identified
1. **JSON Parsing**: Loading entire 50MB JSON into memory
2. **Object Instantiation**: Creating thousands of AL object instances
3. **Index Building**: Creating lookup maps for fast queries
4. **Memory Allocation**: Large arrays and nested objects
5. **String Operations**: Name matching and pattern searching

## 🚀 Optimization Strategies

### 1. Streaming JSON Parsing

Use streaming JSON parser to avoid loading entire file into memory:

```typescript
import StreamValues from 'stream-json/streamers/StreamValues';
import parser from 'stream-json';

export class StreamingSymbolParser {
  async parseSymbolReference(zipPath: string): Promise<void> {
    const symbolStream = await this.extractSymbolStream(zipPath);
    
    // Create streaming pipeline
    const pipeline = symbolStream
      .pipe(parser())
      .pipe(StreamValues.withParser());
      
    // Process objects as they're streamed
    const processor = new IncrementalProcessor();
    
    pipeline.on('data', (data) => {
      // Process each object type incrementally
      if (this.isTableData(data)) {
        processor.processTable(data.value);
      } else if (this.isPageData(data)) {
        processor.processPage(data.value);
      }
      // Continue for all object types...
    });
    
    return new Promise((resolve, reject) => {
      pipeline.on('end', () => resolve(processor.getDatabase()));
      pipeline.on('error', reject);
    });
  }
  
  private async extractSymbolStream(zipPath: string): Promise<NodeJS.ReadableStream> {
    // Extract SymbolReference.json as a stream, not loading entire file
    const zip = new StreamZip.async({ file: zipPath });
    return zip.stream('SymbolReference.json');
  }
}
```

### 2. Memory-Efficient Object Creation

Use object pooling and lazy initialization to reduce memory pressure:

```typescript
// Object pooling for frequently created objects
class ALObjectPool {
  private tablePool: ALTable[] = [];
  private fieldPool: ALField[] = [];
  private procedurePool: ALProcedure[] = [];
  
  getTable(): ALTable {
    return this.tablePool.pop() || new ALTable();
  }
  
  returnTable(table: ALTable): void {
    table.reset(); // Clear properties
    this.tablePool.push(table);
  }
}

// Lazy initialization of expensive properties
class ALTable {
  private _fields?: ALField[];
  private _procedures?: ALProcedure[];
  
  get Fields(): ALField[] {
    if (!this._fields) {
      this._fields = this.parseFields();
    }
    return this._fields;
  }
  
  // Only parse fields when actually requested
  private parseFields(): ALField[] {
    return this.rawFieldData?.map(f => this.parseField(f)) || [];
  }
}
```

### 3. Optimized Index Structures

Use specialized data structures for fast lookups:

```typescript
export class OptimizedSymbolDatabase {
  // Trie for prefix matching (faster than Map for wildcard searches)
  private nameIndex = new Trie<ALObject[]>();
  
  // Bloom filter for existence checks (avoid expensive lookups)
  private existenceFilter = new BloomFilter(50000, 4);
  
  // Specialized indices for common queries
  private tableFieldIndex = new Map<string, ALField[]>();      // Table name -> fields
  private pageSourceIndex = new Map<string, string>();         // Page name -> source table
  private extensionIndex = new Map<string, string[]>();        // Base object -> extensions
  
  // Compressed string storage (many duplicate strings in AL metadata)
  private stringPool = new StringPool();
  
  addObject(obj: ALObject): void {
    // Use string pooling to reduce memory
    const pooledName = this.stringPool.intern(obj.Name);
    obj.Name = pooledName;
    
    // Add to trie for fast prefix searches
    this.nameIndex.insert(pooledName.toLowerCase(), obj);
    
    // Add to bloom filter
    this.existenceFilter.add(pooledName);
    
    // Build specialized indices
    if (obj.Type === 'Table') {
      this.tableFieldIndex.set(pooledName, obj.Fields || []);
    }
  }
  
  searchByPrefix(prefix: string): ALObject[] {
    // Use trie for O(k) prefix search instead of O(n) iteration
    return this.nameIndex.search(prefix.toLowerCase()).flat();
  }
  
  exists(name: string): boolean {
    // Fast existence check using bloom filter (no false negatives)
    return this.existenceFilter.test(name);
  }
}

// Trie implementation for fast prefix searches
class Trie<T> {
  private root: TrieNode<T> = new TrieNode();
  
  insert(key: string, value: T): void {
    let node = this.root;
    for (const char of key) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    if (!node.values) node.values = [];
    node.values.push(value);
  }
  
  search(prefix: string): T[] {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }
    
    // Collect all values under this prefix
    const results: T[] = [];
    this.collectValues(node, results);
    return results;
  }
}
```

### 4. Parallel Processing Pipeline

Process multiple packages and object types in parallel:

```typescript
export class ParallelSymbolProcessor {
  private readonly MAX_CONCURRENCY = Math.min(4, os.cpus().length);
  private readonly semaphore = new Semaphore(this.MAX_CONCURRENCY);
  
  async processPackages(packagePaths: string[]): Promise<ALSymbolDatabase> {
    const database = new OptimizedSymbolDatabase();
    
    // Process packages in parallel with limited concurrency
    const processors = packagePaths.map(path => 
      this.processPackageWithSemaphore(path, database)
    );
    
    await Promise.all(processors);
    
    // Build final indices after all objects are loaded
    await database.buildOptimizedIndices();
    
    return database;
  }
  
  private async processPackageWithSemaphore(
    packagePath: string, 
    database: ALSymbolDatabase
  ): Promise<void> {
    await this.semaphore.acquire();
    try {
      await this.processSinglePackage(packagePath, database);
    } finally {
      this.semaphore.release();
    }
  }
  
  private async processSinglePackage(
    packagePath: string, 
    database: ALSymbolDatabase
  ): Promise<void> {
    // Extract symbols
    const symbolsPath = await this.extractSymbols(packagePath);
    
    // Parse with streaming parser
    const parser = new StreamingSymbolParser();
    
    // Process object types in parallel (within single package)
    const objectTypeProcessors = [
      this.processTables(symbolsPath, database),
      this.processPages(symbolsPath, database),
      this.processCodeunits(symbolsPath, database),
      // ... other object types
    ];
    
    await Promise.all(objectTypeProcessors);
  }
}
```

### 5. Incremental Loading & Caching

Only reload changed packages and cache parsed results:

```typescript
export class IncrementalLoadingManager {
  private packageHashes = new Map<string, string>();
  private cachedSymbols = new Map<string, ALSymbolDatabase>();
  private readonly CACHE_DIR = path.join(os.tmpdir(), 'al-mcp-cache');
  
  async loadPackagesIncremental(packagePaths: string[]): Promise<ALSymbolDatabase> {
    await this.ensureCacheDir();
    
    const changedPackages: string[] = [];
    const unchangedPackages: string[] = [];
    
    // Check which packages have changed
    for (const pkgPath of packagePaths) {
      const currentHash = await this.calculatePackageHash(pkgPath);
      const cachedHash = this.packageHashes.get(pkgPath);
      
      if (currentHash !== cachedHash) {
        changedPackages.push(pkgPath);
        this.packageHashes.set(pkgPath, currentHash);
      } else {
        unchangedPackages.push(pkgPath);
      }
    }
    
    // Load cached symbols for unchanged packages
    const cachedDatabases = await Promise.all(
      unchangedPackages.map(path => this.loadCachedSymbols(path))
    );
    
    // Parse changed packages
    const newDatabases = await this.processor.processPackages(changedPackages);
    
    // Cache newly parsed symbols
    await Promise.all(
      changedPackages.map((path, index) => 
        this.cacheSymbols(path, newDatabases[index])
      )
    );
    
    // Merge all databases
    return this.mergeDatabases([...cachedDatabases, ...newDatabases]);
  }
  
  private async calculatePackageHash(packagePath: string): Promise<string> {
    const stats = await fs.stat(packagePath);
    return `${stats.mtime.getTime()}-${stats.size}`;
  }
  
  private async loadCachedSymbols(packagePath: string): Promise<ALSymbolDatabase | null> {
    const cacheFile = this.getCacheFilePath(packagePath);
    if (await this.fileExists(cacheFile)) {
      const cachedData = await fs.readFile(cacheFile);
      return this.deserializeDatabase(cachedData);
    }
    return null;
  }
}
```

### 6. Memory Management & Garbage Collection

Optimize memory usage and prevent memory leaks:

```typescript
export class MemoryManager {
  private readonly MAX_MEMORY_MB = 500;
  private readonly GC_THRESHOLD_MB = 400;
  
  monitorMemoryUsage(): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      
      if (heapUsedMB > this.GC_THRESHOLD_MB) {
        this.triggerCleanup();
      }
      
      if (heapUsedMB > this.MAX_MEMORY_MB) {
        this.emergencyCleanup();
      }
    }, 30000); // Check every 30 seconds
  }
  
  private triggerCleanup(): void {
    // Clear caches that can be rebuilt
    this.symbolDatabase.clearQueryCache();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  private emergencyCleanup(): void {
    // More aggressive cleanup
    this.symbolDatabase.clearSecondaryIndices();
    this.symbolDatabase.compactStringPool();
    
    // Warn user about memory pressure
    console.warn('High memory usage detected. Consider reducing loaded packages.');
  }
}

// Weak references for objects that can be garbage collected
class WeakSymbolCache {
  private cache = new WeakMap<ALObject, ALObjectDetail>();
  
  getDetail(object: ALObject): ALObjectDetail | undefined {
    return this.cache.get(object);
  }
  
  setDetail(object: ALObject, detail: ALObjectDetail): void {
    this.cache.set(object, detail);
  }
}
```

### 7. Query Optimization

Optimize common queries for sub-100ms response times:

```typescript
export class QueryOptimizer {
  // Pre-computed query results for common patterns
  private queryCache = new LRUCache<string, ALObject[]>(1000);
  
  // Specialized indices for different query patterns
  private prefixIndex = new Map<string, ALObject[]>();        // For "Customer*" patterns
  private containsIndex = new Map<string, ALObject[]>();      // For "*Customer*" patterns
  private exactIndex = new Map<string, ALObject>();           // For exact matches
  
  async searchObjects(pattern: string, type?: string): Promise<ALObject[]> {
    const cacheKey = `${pattern}:${type || 'any'}`;
    
    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached) return cached;
    
    // Optimize query based on pattern type
    let results: ALObject[];
    
    if (pattern.includes('*')) {
      results = this.handleWildcardSearch(pattern, type);
    } else {
      results = this.handleExactSearch(pattern, type);
    }
    
    // Cache results
    this.queryCache.set(cacheKey, results);
    
    return results;
  }
  
  private handleWildcardSearch(pattern: string, type?: string): ALObject[] {
    if (pattern.endsWith('*')) {
      // Prefix search: "Customer*"
      const prefix = pattern.slice(0, -1).toLowerCase();
      return this.prefixIndex.get(prefix) || [];
    } else if (pattern.startsWith('*') && pattern.endsWith('*')) {
      // Contains search: "*Customer*"
      const term = pattern.slice(1, -1).toLowerCase();
      return this.containsIndex.get(term) || [];
    } else {
      // Complex wildcard - fall back to regex (slower)
      return this.handleRegexSearch(pattern, type);
    }
  }
  
  // Build optimized indices during database construction
  buildQueryIndices(objects: ALObject[]): void {
    for (const obj of objects) {
      const name = obj.Name.toLowerCase();
      
      // Build prefix indices for all prefixes
      for (let i = 1; i <= name.length; i++) {
        const prefix = name.substring(0, i);
        this.addToMapArray(this.prefixIndex, prefix, obj);
      }
      
      // Build contains indices for common terms
      const commonTerms = this.extractCommonTerms(name);
      for (const term of commonTerms) {
        this.addToMapArray(this.containsIndex, term, obj);
      }
      
      // Exact match index
      this.exactIndex.set(name, obj);
    }
  }
}
```

## 📈 Performance Benchmarks

### Target Performance Metrics

| Operation | Target Time | Memory Impact |
|-----------|-------------|---------------|
| Load Base Application | < 10 seconds | < 200MB |
| Load additional package | < 2 seconds | < 50MB per package |
| Simple object search | < 50ms | Minimal |
| Complex wildcard search | < 100ms | Minimal |
| Get object definition | < 10ms | Minimal |
| Incremental reload | < 2 seconds | Minimal |

### Memory Usage Breakdown

```
Total Memory Budget: 500MB
├── Symbol Objects: ~200MB (40%)
│   ├── Tables & Fields: ~100MB
│   ├── Pages & Controls: ~60MB
│   └── Procedures & Parameters: ~40MB
├── Indices: ~150MB (30%)
│   ├── Name indices: ~60MB
│   ├── Type indices: ~40MB
│   └── Cross-references: ~50MB
├── String Pool: ~50MB (10%)
├── Query Cache: ~50MB (10%)
└── System Overhead: ~50MB (10%)
```

### Scaling Characteristics

| Codebase Size | Load Time | Memory Usage | Query Time |
|---------------|-----------|--------------|------------|
| Single extension | < 1s | < 50MB | < 20ms |
| Base Application | < 10s | < 200MB | < 50ms |
| Enterprise solution | < 30s | < 500MB | < 100ms |
| Multiple workspaces | < 60s | < 1GB | < 200ms |

## 🔧 Implementation Priorities

### Phase 1 (Critical Performance Features)
1. **Streaming JSON parser** - Essential for large files
2. **Basic indexing** - Name and type lookups
3. **Object pooling** - Reduce GC pressure
4. **Memory monitoring** - Prevent OOM errors

### Phase 2 (Advanced Optimizations)
1. **Trie-based prefix search** - Fast wildcard queries
2. **Parallel processing** - Multi-package loading
3. **Incremental loading** - Change detection
4. **Query result caching** - Sub-100ms responses

### Phase 3 (Enterprise Scale)
1. **Bloom filters** - Existence checks
2. **String pooling** - Reduce duplicate strings  
3. **Weak references** - Better garbage collection
4. **Compressed caching** - Persistent symbol storage

## 📊 Monitoring & Optimization

### Performance Metrics Collection

```typescript
export class PerformanceCollector {
  private metrics = {
    packageLoadTimes: new Map<string, number>(),
    queryTimes: new Map<string, number[]>(),
    memorySnapshots: [] as MemorySnapshot[]
  };
  
  recordPackageLoad(packageName: string, timeMs: number): void {
    this.metrics.packageLoadTimes.set(packageName, timeMs);
  }
  
  recordQuery(queryType: string, timeMs: number): void {
    if (!this.metrics.queryTimes.has(queryType)) {
      this.metrics.queryTimes.set(queryType, []);
    }
    this.metrics.queryTimes.get(queryType)!.push(timeMs);
  }
  
  takeMemorySnapshot(): void {
    const usage = process.memoryUsage();
    this.metrics.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external
    });
  }
  
  generateReport(): PerformanceReport {
    return {
      averageLoadTime: this.calculateAverage(this.metrics.packageLoadTimes),
      queryPerformance: this.analyzeQueryTimes(),
      memoryTrend: this.analyzeMemoryTrend(),
      recommendations: this.generateRecommendations()
    };
  }
}
```

This performance strategy ensures the AL MCP server can handle enterprise-scale AL codebases while maintaining responsiveness for AI tools like Claude Code.