import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { Mutex } from 'async-mutex';
import { ALParser } from './al-parser';
import { GitManager } from './git-manager';
import {
  ALObject,
  ObjectReference,
  SearchResult,
  SearchResultItem,
  CodeSnippet
} from './types/al-objects';
import { ALObjectType, SearchFilters } from './types/al-types';

export interface SearchIndex {
  objects: IndexedObject[];
  metadata: IndexMetadata;
}

export interface IndexedObject {
  type: ALObjectType;
  id?: number;
  name: string;
  namespace?: string;
  caption?: string;
  filePath: string;
  branch: string;
  keywords: string[];
  isObsolete: boolean;
  lastModified: Date;
  size: number;
  codePreview?: CodeSnippet;
  procedures?: Array<{ name: string; line: number; signature?: string }>;
  fields?: Array<{ name: string; type: string }>;
}

export interface IndexMetadata {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  totalObjects: number;
  branches: string[];
  indexHealth: 'healthy' | 'stale' | 'rebuilding' | 'error';
}

export interface SearchOptions extends SearchFilters {
  fuzzy?: boolean;
  maxResults?: number;
  sortBy?: 'relevance' | 'name' | 'type' | 'lastModified';
  sortOrder?: 'asc' | 'desc';
}

export interface PerformanceMetrics {
  indexSize: number;
  avgSearchTime: number;
  lastRebuildTime: number;
  cacheHitRate: number;
  totalSearches: number;
}

export class SearchIndexer {
  private logger: Logger;
  private parser: ALParser;
  private gitManager: GitManager;
  private indexPath: string;
  private repoPath: string;
  private index: Map<string, SearchIndex> = new Map();
  private mutex = new Mutex();
  private performanceMetrics: PerformanceMetrics;
  private searchCache: Map<string, SearchResult> = new Map();
  private readonly maxCacheSize = 1000;

  constructor(logger: Logger, gitManager?: GitManager) {
    this.logger = logger;
    this.parser = new ALParser(logger);
    this.gitManager = gitManager || new GitManager(logger);
    this.indexPath = process.env.INDEX_CACHE_PATH || path.join(process.cwd(), '.cache', 'index-cache');
    this.repoPath = process.env.REPO_CACHE_PATH || path.join(process.cwd(), '.cache', 'repo-cache');
    this.performanceMetrics = {
      indexSize: 0,
      avgSearchTime: 0,
      lastRebuildTime: 0,
      cacheHitRate: 0,
      totalSearches: 0
    };
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Search Indexer');
    
    await this.ensureIndexPath();
    await this.loadExistingIndices();
    
    // Index any branches that are available but not indexed
    await this.indexAvailableBranches();
    
    this.logger.info('Search Indexer initialized', {
      indexedBranches: this.index.size,
      totalObjects: Array.from(this.index.values()).reduce((sum, idx) => sum + idx.metadata.totalObjects, 0)
    });
  }

  private async indexAvailableBranches(): Promise<void> {
    try {
      // Get available branches from git manager
      const availableBranches = await this.gitManager.listBranches();
      
      for (const branchInfo of availableBranches) {
        const branchName = branchInfo.name;
        
        // Check if branch needs indexing
        if (!this.index.has(branchName) || !this.isIndexValid(this.index.get(branchName)!)) {
          this.logger.info(`Auto-indexing branch: ${branchName}`);
          try {
            await this.indexBranch(branchName);
          } catch (error) {
            this.logger.warn(`Failed to auto-index branch: ${branchName}`, { error });
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to auto-index available branches', { error });
    }
  }

  private async ensureIndexPath(): Promise<void> {
    try {
      await fs.access(this.indexPath);
    } catch {
      await fs.mkdir(this.indexPath, { recursive: true });
      this.logger.info(`Created index cache directory: ${this.indexPath}`);
    }
  }

  private async loadExistingIndices(): Promise<void> {
    try {
      const indexFiles = await fs.readdir(this.indexPath);
      
      for (const file of indexFiles) {
        if (file.endsWith('.index.json')) {
          const branchName = file.replace('.index.json', '');
          try {
            const indexData = await this.loadIndexFile(branchName);
            if (indexData && this.isIndexValid(indexData)) {
              this.index.set(branchName, indexData);
              this.logger.debug(`Loaded index for branch: ${branchName}`, {
                objects: indexData.metadata.totalObjects,
                lastUpdated: indexData.metadata.updatedAt
              });
            } else {
              this.logger.warn(`Invalid index for branch: ${branchName}, will rebuild`);
            }
          } catch (error) {
            this.logger.warn(`Failed to load index for branch: ${branchName}`, { error });
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load existing indices', { error });
    }
  }

  private async loadIndexFile(branchName: string): Promise<SearchIndex | null> {
    try {
      const filePath = path.join(this.indexPath, `${branchName}.index.json`);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content, (key, value) => {
        // Parse dates
        if (key.endsWith('At') || key === 'lastModified') {
          return new Date(value);
        }
        return value;
      });
    } catch {
      return null;
    }
  }

  private isIndexValid(index: SearchIndex): boolean {
    // Check if index is not too old (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const age = Date.now() - index.metadata.updatedAt.getTime();
    
    return age < maxAge && index.metadata.totalObjects > 0;
  }

  async indexBranch(branchName: string, force: boolean = false): Promise<void> {
    return await this.mutex.runExclusive(async () => {
      this.logger.info(`Indexing branch: ${branchName}`, { force });

      const startTime = Date.now();
      
      try {
        // Check if we need to rebuild
        if (!force && this.index.has(branchName)) {
          const existingIndex = this.index.get(branchName)!;
          if (this.isIndexValid(existingIndex)) {
            this.logger.debug(`Index for branch ${branchName} is still valid, skipping`);
            return;
          }
        }

        // Update metadata to indicate rebuilding
        const buildingIndex: SearchIndex = {
          objects: [],
          metadata: {
            version: '1.0.0',
            createdAt: new Date(),
            updatedAt: new Date(),
            totalObjects: 0,
            branches: [branchName],
            indexHealth: 'rebuilding'
          }
        };
        this.index.set(branchName, buildingIndex);

        // Switch to branch and parse objects
        await this.gitManager.checkoutBranch(branchName);
        const alFiles = await this.gitManager.listFiles('', branchName, '.al');
        
        const indexedObjects: IndexedObject[] = [];
        
        this.logger.info(`Found ${alFiles.length} AL files to index`);
        
        for (const filePath of alFiles) {
          try {
            const fullPath = path.join(this.repoPath, filePath);
            this.logger.debug(`Parsing AL file: ${filePath} -> ${fullPath}`);
            
            const parseResult = await this.parser.parseFile(fullPath, branchName, {
              includeObsolete: true,
              includeDetails: false,
              validateSyntax: false
            });

            this.logger.debug(`Parsed ${parseResult.objects.length} objects from ${filePath}`);

            for (const obj of parseResult.objects) {
              const indexedObj = await this.createIndexedObject(obj, filePath);
              indexedObjects.push(indexedObj);
            }
          } catch (error) {
            this.logger.warn(`Failed to index file: ${filePath}`, { error });
          }
        }

        // Create final index
        const finalIndex: SearchIndex = {
          objects: indexedObjects,
          metadata: {
            version: '1.0.0',
            createdAt: buildingIndex.metadata.createdAt,
            updatedAt: new Date(),
            totalObjects: indexedObjects.length,
            branches: [branchName],
            indexHealth: 'healthy'
          }
        };

        this.index.set(branchName, finalIndex);
        await this.saveIndexFile(branchName, finalIndex);

        const indexTime = Date.now() - startTime;
        this.performanceMetrics.lastRebuildTime = indexTime;

        this.logger.info(`Branch indexed successfully: ${branchName}`, {
          objects: indexedObjects.length,
          files: alFiles.length,
          indexTime: `${indexTime}ms`
        });

      } catch (error) {
        // Mark index as error state
        if (this.index.has(branchName)) {
          const errorIndex = this.index.get(branchName)!;
          errorIndex.metadata.indexHealth = 'error';
          errorIndex.metadata.updatedAt = new Date();
        }
        
        this.logger.error(`Failed to index branch: ${branchName}`, { error });
        throw error;
      }
    });
  }

  private async createIndexedObject(obj: ALObject, filePath: string): Promise<IndexedObject> {
    // Generate keywords for better searchability
    const keywords = this.generateKeywords(obj);
    
    // Get file stats
    let size = 0;
    let lastModified = new Date();
    
    try {
      const fullPath = path.join(this.repoPath, filePath);
      const stats = await fs.stat(fullPath);
      size = stats.size;
      lastModified = stats.mtime;
    } catch {
      // Use current time if file stats are unavailable
    }

    // Extract procedures and fields for preview
    let procedures: Array<{ name: string; line: number; signature?: string }> = [];
    let fields: Array<{ name: string; type: string }> = [];
    
    if ('procedures' in obj && Array.isArray(obj.procedures)) {
      procedures = obj.procedures.map(p => ({ 
        name: p.name, 
        line: p.lineNumber,
        signature: p.signature
      }));
    }
    
    if ('fields' in obj && Array.isArray(obj.fields)) {
      fields = obj.fields.map(f => ({ 
        name: f.name, 
        type: f.type 
      }));
    }

    return {
      type: obj.type,
      id: obj.id,
      name: obj.name,
      namespace: obj.namespace,
      caption: obj.caption,
      filePath,
      branch: obj.branch,
      keywords,
      isObsolete: obj.isObsolete || false,
      lastModified,
      size,
      codePreview: obj.codePreview,
      procedures: procedures.length > 0 ? procedures : undefined,
      fields: fields.length > 0 ? fields : undefined
    };
  }

  private generateKeywords(obj: ALObject): string[] {
    const keywords = new Set<string>();
    
    // Add object name variations
    keywords.add(obj.name.toLowerCase());
    keywords.add(obj.name.replace(/\s+/g, '').toLowerCase());
    
    if (obj.caption) {
      keywords.add(obj.caption.toLowerCase());
      keywords.add(obj.caption.replace(/\s+/g, '').toLowerCase());
    }

    // Add namespace parts
    if (obj.namespace) {
      keywords.add(obj.namespace.toLowerCase());
      obj.namespace.split('.').forEach(part => keywords.add(part.toLowerCase()));
    }

    // Add object type
    keywords.add(obj.type.toLowerCase());

    // Add ID as string
    if (obj.id) {
      keywords.add(obj.id.toString());
    }

    // Add file name parts
    const fileName = path.basename(obj.filePath, '.al');
    fileName.split(/[-._\s]/).forEach(part => {
      if (part.length > 2) {
        keywords.add(part.toLowerCase());
      }
    });

    return Array.from(keywords);
  }

  private async saveIndexFile(branchName: string, index: SearchIndex): Promise<void> {
    try {
      const filePath = path.join(this.indexPath, `${branchName}.index.json`);
      const content = JSON.stringify(index, null, 2);
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      this.logger.error(`Failed to save index file for branch: ${branchName}`, { error });
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const startTime = Date.now();
    this.performanceMetrics.totalSearches++;

    // Check cache first
    const cacheKey = `${query}-${JSON.stringify(options)}`;
    if (this.searchCache.has(cacheKey)) {
      this.performanceMetrics.cacheHitRate = 
        (this.performanceMetrics.cacheHitRate * (this.performanceMetrics.totalSearches - 1) + 1) / 
        this.performanceMetrics.totalSearches;
      
      return this.searchCache.get(cacheKey)!;
    }

    try {
      // Get objects from specified branches or all branches
      const searchBranches = options.branches || Array.from(this.index.keys());
      const allObjects = this.getAllObjectsFromBranches(searchBranches);
      
      // Apply filters
      let filteredObjects = this.applyFilters(allObjects, options);
      
      // Perform search
      const searchResults = this.performSearch(filteredObjects, query, options);
      
      // Sort results
      const sortedResults = this.sortResults(searchResults, options.sortBy || 'relevance', options.sortOrder || 'desc');
      
      // Limit results
      const maxResults = options.maxResults || 100;
      const limitedResults = sortedResults.slice(0, maxResults);

      const searchTime = Date.now() - startTime;
      this.updatePerformanceMetrics(searchTime);

      // Build enhanced search result with previews
      const searchItems: SearchResultItem[] = limitedResults.map(item => ({
        object: this.toObjectReference(item.object),
        score: item.score,
        preview: {
          fields: item.object.fields?.slice(0, 5).map(f => `${f.name}: ${f.type}`),
          procedures: item.object.procedures?.slice(0, 5).map(p => p.signature || p.name),
          snippet: item.object.codePreview
        },
        relatedObjects: this.extractRelatedObjects(item.object)
      }));
      
      // Calculate facets
      const facets = this.calculateFacets(searchResults);

      const result: SearchResult = {
        objects: limitedResults.map(item => this.toObjectReference(item.object)),
        items: searchItems,
        totalCount: searchResults.length,
        branches: searchBranches,
        searchTime,
        filters: options,
        facets
      };

      // Cache result
      this.cacheSearchResult(cacheKey, result);
      
      return result;

    } catch (error) {
      this.logger.error('Search failed', { query, options, error });
      throw error;
    }
  }

  private getAllObjectsFromBranches(branches: string[]): IndexedObject[] {
    const allObjects: IndexedObject[] = [];
    
    for (const branch of branches) {
      const index = this.index.get(branch);
      if (index && index.metadata.indexHealth === 'healthy') {
        allObjects.push(...index.objects);
      }
    }
    
    return allObjects;
  }

  private applyFilters(objects: IndexedObject[], filters: SearchFilters): IndexedObject[] {
    let filtered = objects;

    if (filters.objectType) {
      filtered = filtered.filter(obj => obj.type === filters.objectType);
    }

    if (filters.namespace) {
      const namespacePattern = filters.namespace.replace('*', '.*');
      const regex = new RegExp(namespacePattern, 'i');
      filtered = filtered.filter(obj => obj.namespace && regex.test(obj.namespace));
    }

    if (filters.idRange) {
      filtered = this.applyIdRangeFilter(filtered, filters.idRange);
    }

    if (!filters.includeObsolete) {
      filtered = filtered.filter(obj => !obj.isObsolete);
    }

    return filtered;
  }

  private applyIdRangeFilter(objects: IndexedObject[], idRange: string): IndexedObject[] {
    if (idRange === 'AppSource') {
      return objects.filter(obj => obj.id && obj.id >= 100000);
    } else if (idRange === 'PTE') {
      return objects.filter(obj => obj.id && obj.id >= 50000 && obj.id < 100000);
    } else if (idRange === 'Microsoft') {
      return objects.filter(obj => obj.id && obj.id < 50000);
    } else if (idRange.includes('-')) {
      const [min, max] = idRange.split('-').map(n => parseInt(n));
      return objects.filter(obj => obj.id && obj.id >= min && obj.id <= max);
    }
    
    return objects;
  }

  private performSearch(objects: IndexedObject[], query: string, options: SearchOptions): Array<{object: IndexedObject, score: number}> {
    const queryLower = query.toLowerCase();
    const results: Array<{object: IndexedObject, score: number}> = [];

    for (const obj of objects) {
      let score = 0;

      // Exact name match
      if (obj.name.toLowerCase() === queryLower) {
        score += 100;
      } else if (obj.name.toLowerCase().includes(queryLower)) {
        score += 50;
      }

      // Caption match
      if (obj.caption && obj.caption.toLowerCase().includes(queryLower)) {
        score += 30;
      }

      // Keyword match
      for (const keyword of obj.keywords) {
        if (keyword === queryLower) {
          score += 20;
        } else if (keyword.includes(queryLower)) {
          score += 10;
        }
      }

      // ID match
      if (obj.id && obj.id.toString() === query) {
        score += 80;
      }

      // Fuzzy matching
      if (options.fuzzy && score === 0) {
        score = this.calculateFuzzyScore(queryLower, obj);
      }

      if (score > 0) {
        results.push({ object: obj, score });
      }
    }

    return results;
  }

  private calculateFuzzyScore(query: string, obj: IndexedObject): number {
    // Simple fuzzy matching based on Levenshtein distance
    const maxDistance = Math.floor(query.length / 3);
    
    for (const keyword of obj.keywords) {
      const distance = this.levenshteinDistance(query, keyword);
      if (distance <= maxDistance) {
        return Math.max(0, 10 - distance);
      }
    }
    
    return 0;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[b.length][a.length];
  }

  private sortResults(
    results: Array<{object: IndexedObject, score: number}>, 
    sortBy: string, 
    sortOrder: string
  ): Array<{object: IndexedObject, score: number}> {
    const direction = sortOrder === 'asc' ? 1 : -1;
    
    return results.sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return direction * (b.score - a.score);
        case 'name':
          return direction * a.object.name.localeCompare(b.object.name);
        case 'type':
          return direction * a.object.type.localeCompare(b.object.type);
        case 'lastModified':
          return direction * (b.object.lastModified.getTime() - a.object.lastModified.getTime());
        default:
          return direction * (b.score - a.score);
      }
    });
  }

  private toObjectReference(obj: IndexedObject): ObjectReference {
    return {
      type: obj.type,
      name: obj.name,
      id: obj.id,
      namespace: obj.namespace,
      filePath: obj.filePath,
      branch: obj.branch
    };
  }

  private updatePerformanceMetrics(searchTime: number): void {
    const totalSearches = this.performanceMetrics.totalSearches;
    const currentAvg = this.performanceMetrics.avgSearchTime;
    
    this.performanceMetrics.avgSearchTime = 
      (currentAvg * (totalSearches - 1) + searchTime) / totalSearches;
  }

  private cacheSearchResult(key: string, result: SearchResult): void {
    // Implement LRU cache
    if (this.searchCache.size >= this.maxCacheSize) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) {
        this.searchCache.delete(firstKey);
      }
    }
    
    this.searchCache.set(key, result);
  }

  private extractRelatedObjects(obj: IndexedObject): string[] {
    const related: Set<string> = new Set();
    
    // Extract from procedures if available
    if (obj.procedures) {
      obj.procedures.forEach(proc => {
        if (proc.signature) {
          // Extract types from parameters
          const typeMatches = proc.signature.match(/Record\s+"([^"]+)"/g);
          if (typeMatches) {
            typeMatches.forEach(match => {
              const tableName = match.match(/Record\s+"([^"]+)"/)?.[1];
              if (tableName) related.add(tableName);
            });
          }
        }
      });
    }
    
    return Array.from(related);
  }

  private calculateFacets(results: Array<{object: IndexedObject, score: number}>): any {
    const typeCounts: Record<string, number> = {};
    const namespaceCounts: Record<string, number> = {};
    
    results.forEach(({ object }) => {
      // Count types
      typeCounts[object.type] = (typeCounts[object.type] || 0) + 1;
      
      // Count namespaces
      if (object.namespace) {
        namespaceCounts[object.namespace] = (namespaceCounts[object.namespace] || 0) + 1;
      }
    });
    
    return {
      types: typeCounts,
      namespaces: namespaceCounts
    };
  }

  async removeBranchIndex(branchName: string): Promise<void> {
    return await this.mutex.runExclusive(async () => {
      this.logger.info(`Removing index for branch: ${branchName}`);
      
      // Remove from memory
      this.index.delete(branchName);
      
      // Remove index file
      try {
        const filePath = path.join(this.indexPath, `${branchName}.index.json`);
        await fs.unlink(filePath);
      } catch (error) {
        this.logger.warn(`Failed to remove index file for branch: ${branchName}`, { error });
      }
      
      // Clear search cache
      this.searchCache.clear();
      
      this.logger.info(`Index removed for branch: ${branchName}`);
    });
  }

  async rebuild(): Promise<void> {
    return await this.mutex.runExclusive(async () => {
      this.logger.info('Rebuilding all indices');
      
      const branches = Array.from(this.index.keys());
      this.index.clear();
      this.searchCache.clear();
      
      for (const branch of branches) {
        try {
          await this.indexBranch(branch, true);
        } catch (error) {
          this.logger.error(`Failed to rebuild index for branch: ${branch}`, { error });
        }
      }
      
      this.logger.info('Index rebuild completed');
    });
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    // Update index size
    let totalSize = 0;
    for (const [, index] of this.index) {
      totalSize += index.objects.length;
    }
    this.performanceMetrics.indexSize = totalSize;
    
    return { ...this.performanceMetrics };
  }

  async healthCheck(): Promise<any> {
    try {
      const indices = Array.from(this.index.entries());
      const healthyIndices = indices.filter(([, idx]) => idx.metadata.indexHealth === 'healthy').length;
      const staleIndices = indices.filter(([, idx]) => idx.metadata.indexHealth === 'stale').length;
      const errorIndices = indices.filter(([, idx]) => idx.metadata.indexHealth === 'error').length;

      const totalObjects = indices.reduce((sum, [, idx]) => sum + idx.metadata.totalObjects, 0);

      return {
        status: errorIndices === 0 ? 'healthy' : 'degraded',
        indices: {
          total: indices.length,
          healthy: healthyIndices,
          stale: staleIndices,
          error: errorIndices
        },
        objects: {
          total: totalObjects,
          avgPerBranch: indices.length > 0 ? Math.round(totalObjects / indices.length) : 0
        },
        performance: await this.getPerformanceMetrics(),
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Utility methods

  getBranchIndices(): string[] {
    return Array.from(this.index.keys());
  }

  getIndexStats(branchName: string): IndexMetadata | null {
    const index = this.index.get(branchName);
    return index ? index.metadata : null;
  }

  async clearCache(): Promise<void> {
    this.searchCache.clear();
    this.logger.info('Search cache cleared');
  }

  // Auto-refresh stale indices
  async refreshStaleIndices(): Promise<void> {
    const staleThreshold = 12 * 60 * 60 * 1000; // 12 hours
    const now = Date.now();

    for (const [branchName, index] of this.index) {
      const age = now - index.metadata.updatedAt.getTime();
      
      if (age > staleThreshold && index.metadata.indexHealth === 'healthy') {
        index.metadata.indexHealth = 'stale';
        this.logger.info(`Marked index as stale: ${branchName}`);
        
        // Optionally trigger background refresh
        // this.indexBranch(branchName, true).catch(error => {
        //   this.logger.error(`Background refresh failed for branch: ${branchName}`, { error });
        // });
      }
    }
  }
}