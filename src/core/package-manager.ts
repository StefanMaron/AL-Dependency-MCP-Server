import * as path from 'path';
import * as fs from 'fs/promises';
import * as glob from 'fast-glob';
import { ALCliWrapper, ALAppManifest } from '../cli/al-cli';
import { StreamingSymbolParser, ParseProgress } from '../parser/streaming-parser';
import { OptimizedSymbolDatabase } from './symbol-database';
import { ALPackageInfo, ALPackageLoadResult } from '../types/al-types';

export interface PackageDiscoveryOptions {
  packagesPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  recursive?: boolean;
}

export class ALPackageManager {
  private alCli: ALCliWrapper;
  private parser: StreamingSymbolParser;
  private database: OptimizedSymbolDatabase;
  private progressCallback?: (progress: ParseProgress) => void;

  constructor(
    alCli?: ALCliWrapper,
    progressCallback?: (progress: ParseProgress) => void,
    database?: OptimizedSymbolDatabase
  ) {
    this.alCli = alCli || new ALCliWrapper();
    this.progressCallback = progressCallback;
    this.parser = new StreamingSymbolParser(progressCallback);
    this.database = database || new OptimizedSymbolDatabase();
  }

  /**
   * Auto-discover AL packages in .alpackages directories
   */
  async discoverPackages(options: PackageDiscoveryOptions): Promise<string[]> {
    try {
      // Check if packages path exists
      await fs.access(options.packagesPath);
    } catch (error) {
      throw new Error(`Packages directory not found: ${options.packagesPath}`);
    }

    const includePatterns = options.includePatterns || ['**/*.app'];
    const excludePatterns = options.excludePatterns || ['**/.*', '**/node_modules/**'];

    const searchPath = options.recursive 
      ? path.join(options.packagesPath, '**/*.app')
      : path.join(options.packagesPath, '*.app');

    const appFiles = await glob.glob(includePatterns, {
      cwd: options.packagesPath,
      absolute: true,
      ignore: excludePatterns,
      onlyFiles: true
    });

    this.reportProgress('discovery', appFiles.length, appFiles.length, 
      `Found ${appFiles.length} AL packages`);

    return appFiles.sort(); // Sort for consistent ordering
  }

  /**
   * Load AL packages from multiple .app files
   */
  async loadPackages(packagePaths: string[], forceReload = false): Promise<ALPackageLoadResult> {
    const startTime = Date.now();
    const loadedPackages: ALPackageInfo[] = [];
    const errors: string[] = [];
    let totalObjects = 0;

    if (forceReload) {
      this.database.clear();
    }

    this.reportProgress('loading', 0, packagePaths.length, 'Starting package loading');

    // Process packages with controlled concurrency
    const maxConcurrency = Math.min(4, packagePaths.length);
    for (let i = 0; i < packagePaths.length; i += maxConcurrency) {
      const batch = packagePaths.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (packagePath) => {
        try {
          const result = await this.loadSinglePackage(packagePath);
          loadedPackages.push(result.packageInfo);
          totalObjects += result.objectCount;
          
          this.reportProgress('loading', i + batch.indexOf(packagePath) + 1, packagePaths.length,
            `Loaded ${result.packageInfo.name}`);
        } catch (error) {
          const errorMessage = `Failed to load ${path.basename(packagePath)}: ${error}`;
          errors.push(errorMessage);
          console.warn(errorMessage);
        }
      });

      await Promise.all(batchPromises);
    }

    // Build optimized indices after all packages are loaded
    this.reportProgress('indexing', totalObjects, totalObjects, 'Building indices');
    this.database.buildOptimizedIndices();

    const loadTimeMs = Date.now() - startTime;

    this.reportProgress('completed', loadedPackages.length, packagePaths.length, 
      `Loaded ${loadedPackages.length} packages in ${loadTimeMs}ms`);

    return {
      packages: loadedPackages,
      errors,
      totalObjects,
      loadTimeMs
    };
  }

  /**
   * Load a single AL package
   */
  private async loadSinglePackage(packagePath: string): Promise<{
    packageInfo: ALPackageInfo;
    objectCount: number;
  }> {
    try {
      // Get package manifest
      const manifest = await this.alCli.getPackageManifest(packagePath);
      
      // Extract symbols
      const symbolPath = await this.alCli.extractSymbols(packagePath);
      
      try {
        // Parse symbols
        const objects = await this.parser.parseSymbolPackage(symbolPath, manifest.name);
        
        // Add objects to database
        for (const obj of objects) {
          this.database.addObject(obj, manifest.name);
        }

        // Create package info
        const packageInfo: ALPackageInfo = {
          name: manifest.name,
          id: manifest.id,
          version: manifest.version,
          publisher: manifest.publisher,
          dependencies: (manifest.dependencies || []).map(dep => ({
            name: dep.name,
            id: dep.id,
            version: dep.version
          })),
          filePath: packagePath
        };

        return {
          packageInfo,
          objectCount: objects.length
        };
      } finally {
        // Clean up temporary symbol file
        await this.alCli.cleanupSymbolFile(symbolPath);
      }
    } catch (error) {
      throw new Error(`Failed to load package ${packagePath}: ${error}`);
    }
  }

  /**
   * Get the internal database for MCP tools
   */
  getDatabase(): OptimizedSymbolDatabase {
    return this.database;
  }

  /**
   * Get loaded package information
   */
  getLoadedPackages(): ALPackageInfo[] {
    const packages: ALPackageInfo[] = [];
    const packageSummary = this.database.getPackageSummary();
    
    // This is a simplified version - in a full implementation,
    // we'd store the full package info alongside the objects
    for (const [packageName, objectCount] of packageSummary) {
      packages.push({
        name: packageName,
        id: '', // Would need to be stored during loading
        version: '',
        publisher: '',
        dependencies: [],
        filePath: ''
      });
    }

    return packages;
  }

  /**
   * Find .alpackages directories automatically
   */
  async autoDiscoverPackageDirectories(rootPath: string): Promise<string[]> {
    const packageDirs: string[] = [];
    
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(rootPath, entry.name);
          
          // Check if this is an .alpackages directory
          if (entry.name === '.alpackages') {
            packageDirs.push(entryPath);
          } else {
            // Recursively search subdirectories
            const subDirs = await this.autoDiscoverPackageDirectories(entryPath);
            packageDirs.push(...subDirs);
          }
        }
      }
    } catch (error) {
      // Ignore directories we can't access
      console.warn(`Cannot access directory ${rootPath}: ${error}`);
    }

    return packageDirs;
  }

  /**
   * Check package dependencies and resolve load order
   */
  async resolveDependencyOrder(packagePaths: string[]): Promise<string[]> {
    const packageManifests = new Map<string, { manifest: ALAppManifest; path: string }>();
    
    // Load all manifests
    for (const packagePath of packagePaths) {
      try {
        const manifest = await this.alCli.getPackageManifest(packagePath);
        packageManifests.set(manifest.id, { manifest, path: packagePath });
      } catch (error) {
        console.warn(`Failed to load manifest for ${packagePath}: ${error}`);
      }
    }

    // Topological sort based on dependencies
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (packageId: string): void => {
      if (visited.has(packageId)) return;
      if (visiting.has(packageId)) {
        throw new Error(`Circular dependency detected involving package ${packageId}`);
      }

      const packageData = packageManifests.get(packageId);
      if (!packageData) return; // Skip unknown dependencies

      visiting.add(packageId);

      // Visit dependencies first
      if (packageData.manifest.dependencies) {
        for (const dep of packageData.manifest.dependencies) {
          visit(dep.id);
        }
      }

      visiting.delete(packageId);
      visited.add(packageId);
      sorted.push(packageData.path);
    };

    // Visit all packages
    for (const [packageId] of packageManifests) {
      visit(packageId);
    }

    return sorted;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(phase: string, processed: number, total?: number, message?: string): void {
    if (this.progressCallback) {
      this.progressCallback({
        phase,
        processed,
        total,
        currentObject: message
      });
    }
  }
}