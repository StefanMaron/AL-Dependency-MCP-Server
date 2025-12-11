import * as path from 'path';
import * as fs from 'fs/promises';
import * as glob from 'fast-glob';
import { ALCliWrapper, ALAppManifest } from '../cli/al-cli';
import { StreamingSymbolParser, ParseProgress } from '../parser/streaming-parser';
import { ZipFallbackExtractor } from '../parser/zip-fallback';
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
  private zipExtractor: ZipFallbackExtractor;
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
    this.zipExtractor = new ZipFallbackExtractor();
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

    // Filter to only use the most recent version of each package
    const filteredPaths = await this.filterToLatestVersions(packagePaths);
    const originalCount = packagePaths.length;
    const filteredCount = filteredPaths.length;
    
    if (originalCount > filteredCount) {
      this.reportProgress('filtering', filteredCount, originalCount, 
        `Filtered to ${filteredCount} most recent versions from ${originalCount} packages`);
    }

    this.reportProgress('loading', 0, filteredPaths.length, 'Starting package loading');

    // Process packages with controlled concurrency
    const maxConcurrency = Math.min(4, filteredPaths.length);
    for (let i = 0; i < filteredPaths.length; i += maxConcurrency) {
      const batch = filteredPaths.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (packagePath) => {
        try {
          const result = await this.loadSinglePackage(packagePath);
          loadedPackages.push(result.packageInfo);
          totalObjects += result.objectCount;
          
          this.reportProgress('loading', i + batch.indexOf(packagePath) + 1, filteredPaths.length,
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

    this.reportProgress('completed', loadedPackages.length, filteredPaths.length, 
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
   * Tries ZIP extraction first, falls back to AL CLI if needed
   */
  private async loadSinglePackage(packagePath: string): Promise<{
    packageInfo: ALPackageInfo;
    objectCount: number;
  }> {
    // Try ZIP extraction first (works without AL CLI)
    try {
      return await this.loadPackageViaZip(packagePath);
    } catch (zipError) {
      // Fall back to AL CLI for packages that need conversion
      try {
        return await this.loadPackageViaAlCli(packagePath);
      } catch (cliError) {
        // Both methods failed - report the ZIP error as primary
        throw new Error(`Failed to load package ${packagePath}: ${zipError}`);
      }
    }
  }

  /**
   * Load package using direct ZIP extraction (no AL CLI required)
   */
  private async loadPackageViaZip(packagePath: string): Promise<{
    packageInfo: ALPackageInfo;
    objectCount: number;
  }> {
    // Extract manifest directly from .app file via ZIP extraction
    const manifest = await this.zipExtractor.extractManifest(packagePath);

    // Parse symbols directly from .app file
    const objects = await this.parser.parseSymbolPackage(packagePath, manifest.name);

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
  }

  /**
   * Load package using AL CLI tools (fallback for packages needing conversion)
   */
  private async loadPackageViaAlCli(packagePath: string): Promise<{
    packageInfo: ALPackageInfo;
    objectCount: number;
  }> {
    // Get package manifest via AL CLI
    const manifest = await this.alCli.getPackageManifest(packagePath);

    // Extract symbols via AL CLI
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
    for (const [packageName] of packageSummary) {
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
   * Find .alpackages directories and AL project directories automatically
   */
  async autoDiscoverPackageDirectories(rootPath: string, maxDepth: number = 2): Promise<string[]> {
    // Validate rootPath to prevent common issues
    if (!rootPath) {
      throw new Error('rootPath is required and cannot be empty. Please provide the absolute path to your AL project directory.');
    }
    
    if (!path.isAbsolute(rootPath)) {
      throw new Error(`rootPath must be an absolute path. Received: "${rootPath}". Example: "/path/to/your/al-project" or "C:\\path\\to\\your\\al-project"`);
    }

    const packageDirs: string[] = [];
    
    // First, try to find .alpackages directories
    await this.searchForAlPackagesDirectories(rootPath, packageDirs, maxDepth);
    
    // Also look for AL project directories (containing app.json and .app files)
    await this.searchForProjectDirectories(rootPath, packageDirs, maxDepth);
    
    // If no .alpackages found, check for custom AL packageCachePath settings
    if (packageDirs.length === 0) {
      const customPaths = await this.getCustomPackagePaths(rootPath);
      for (const customPath of customPaths) {
        try {
          // Check if custom path exists and contains .app files
          const stat = await fs.stat(customPath);
          if (stat.isDirectory()) {
            const appFiles = await this.discoverPackages({
              packagesPath: customPath,
              recursive: false
            });
            if (appFiles.length > 0) {
              packageDirs.push(customPath);
            }
          }
        } catch (error) {
          // Custom path doesn't exist or can't be accessed, skip
          continue;
        }
      }
    }

    return packageDirs;
  }

  private async searchForProjectDirectories(rootPath: string, packageDirs: string[], maxDepth: number): Promise<void> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(rootPath, entry.name);
          
          // Skip system directories and common directories that shouldn't be scanned
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          
          // Check if this directory contains app.json (AL project) and has .app files
          const appJsonPath = path.join(entryPath, 'app.json');
          try {
            await fs.access(appJsonPath);
            // Found app.json, check for .app files in this directory
            const appFiles = await this.discoverPackages({
              packagesPath: entryPath,
              recursive: false
            });
            if (appFiles.length > 0) {
              packageDirs.push(entryPath);
            }
          } catch {
            // No app.json or no access, continue searching subdirectories
            if (maxDepth > 0) {
              await this.searchForProjectDirectories(entryPath, packageDirs, maxDepth - 1);
            }
          }
        }
      }
    } catch (error) {
      // Ignore directories we can't access
      if (error && (error as any).code !== 'EPERM' && (error as any).code !== 'EACCES') {
        console.warn(`Cannot access directory ${rootPath}: ${error}`);
      }
    }
  }

  private async searchForAlPackagesDirectories(rootPath: string, packageDirs: string[], maxDepth: number): Promise<void> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(rootPath, entry.name);
          
          // Skip system directories and common directories that shouldn't be scanned
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          
          // Check if this is an .alpackages directory
          if (entry.name === '.alpackages') {
            packageDirs.push(entryPath);
          } else if (maxDepth > 0) {
            // Only search subdirectories if we haven't reached max depth
            await this.searchForAlPackagesDirectories(entryPath, packageDirs, maxDepth - 1);
          }
        }
      }
    } catch (error) {
      // Ignore directories we can't access - but don't log every error to reduce noise
      if (error && (error as any).code !== 'EPERM' && (error as any).code !== 'EACCES') {
        console.warn(`Cannot access directory ${rootPath}: ${error}`);
      }
    }
  }

  /**
   * Get custom package paths from VS Code AL extension settings
   */
  private async getCustomPackagePaths(rootPath: string): Promise<string[]> {
    const customPaths: string[] = [];
    
    try {
      // Check workspace settings first (.vscode/settings.json)
      const workspaceSettingsPath = path.join(rootPath, '.vscode', 'settings.json');
      const workspaceCachePath = await this.readPackageCachePathFromSettings(workspaceSettingsPath);
      if (workspaceCachePath) {
        // Resolve relative paths relative to workspace root
        const resolvedPath = path.isAbsolute(workspaceCachePath) 
          ? workspaceCachePath 
          : path.resolve(rootPath, workspaceCachePath);
        customPaths.push(resolvedPath);
      }

      // Check folder-level settings (.vscode/settings.json in parent directories)
      let currentDir = rootPath;
      let searchDepth = 0;
      const maxParentSearch = 3; // Limit how far up we search

      while (currentDir !== path.dirname(currentDir) && searchDepth < maxParentSearch) {
        const folderSettingsPath = path.join(currentDir, '.vscode', 'settings.json');
        const folderCachePath = await this.readPackageCachePathFromSettings(folderSettingsPath);
        if (folderCachePath && folderCachePath !== workspaceCachePath) {
          const resolvedPath = path.isAbsolute(folderCachePath)
            ? folderCachePath
            : path.resolve(currentDir, folderCachePath);
          customPaths.push(resolvedPath);
        }
        currentDir = path.dirname(currentDir);
        searchDepth++;
      }
    } catch (error) {
      // Settings reading failed, continue without custom paths
    }

    return customPaths;
  }

  /**
   * Read al.packageCachePath from a VS Code settings file
   */
  private async readPackageCachePathFromSettings(settingsPath: string): Promise<string | null> {
    try {
      const settingsContent = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsContent);
      return settings['al.packageCachePath'] || null;
    } catch (error) {
      // Settings file doesn't exist or can't be parsed
      return null;
    }
  }

  /**
   * Check if a directory should be skipped during auto-discovery
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      // System directories
      'node_modules', '.git', '.vs', '.vscode', 
      // Build/temp directories
      'bin', 'obj', 'target', 'build', 'dist', 'out',
      // Package managers and caches
      '.npm', '.yarn', '.nuget', '.dotnet',
      // OS directories and temp
      'AppData', 'ProgramData', 'Program Files', 'Program Files (x86)',
      'Windows', 'System32', '$Recycle.Bin', 'Temp', 'tmp',
      // Hidden/system directories
      '..', '.',
      // Docker and containers
      'windowsfilter'
    ];
    
    return skipDirs.some(skipDir => 
      dirName.toLowerCase() === skipDir.toLowerCase() ||
      dirName.startsWith('.') && dirName !== '.alpackages'
    );
  }

  /**
   * Check package dependencies and resolve load order
   */
  async resolveDependencyOrder(packagePaths: string[]): Promise<string[]> {
    const packageManifests = new Map<string, { manifest: ALAppManifest; path: string }>();

    // Load all manifests - try ZIP extraction first, fall back to AL CLI
    for (const packagePath of packagePaths) {
      try {
        let manifest: ALAppManifest;
        try {
          const extracted = await this.zipExtractor.extractManifest(packagePath);
          // Convert to ALAppManifest format
          manifest = {
            id: extracted.id,
            name: extracted.name,
            publisher: extracted.publisher,
            version: extracted.version,
            dependencies: extracted.dependencies?.map(dep => ({
              id: dep.id,
              name: dep.name,
              publisher: dep.publisher,
              version: dep.version
            }))
          };
        } catch {
          // Fall back to AL CLI
          manifest = await this.alCli.getPackageManifest(packagePath);
        }
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
   * Filter package paths to only include the most recent version of each package
   */
  async filterToLatestVersions(packagePaths: string[]): Promise<string[]> {
    const packagesByName = new Map<string, { path: string; version: string; timestamp: number }[]>();

    // Group packages by name
    for (const packagePath of packagePaths) {
      try {
        // Try ZIP extraction first, fall back to AL CLI
        let manifest;
        try {
          manifest = await this.zipExtractor.extractManifest(packagePath);
        } catch {
          manifest = await this.alCli.getPackageManifest(packagePath);
        }
        const packageKey = `${manifest.publisher}_${manifest.name}`;

        if (!packagesByName.has(packageKey)) {
          packagesByName.set(packageKey, []);
        }

        // Get file timestamp for secondary sorting
        const stats = await fs.stat(packagePath);

        packagesByName.get(packageKey)!.push({
          path: packagePath,
          version: manifest.version,
          timestamp: stats.mtimeMs
        });
      } catch (error) {
        // If we can't get manifest, include the package anyway (might be corrupted but shouldn't be filtered out)
        console.warn(`Failed to get manifest for ${packagePath}, including anyway: ${error}`);
        const fallbackKey = path.basename(packagePath);
        if (!packagesByName.has(fallbackKey)) {
          packagesByName.set(fallbackKey, []);
        }
        const stats = await fs.stat(packagePath).catch(() => ({ mtimeMs: 0 }));
        packagesByName.get(fallbackKey)!.push({
          path: packagePath,
          version: '0.0.0.0',
          timestamp: stats.mtimeMs
        });
      }
    }
    
    // Select the most recent version of each package
    const filteredPaths: string[] = [];
    for (const [packageKey, versions] of packagesByName) {
      if (versions.length === 1) {
        filteredPaths.push(versions[0].path);
      } else {
        // Sort by version (semantic versioning), then by timestamp (most recent first)
        versions.sort((a, b) => {
          const versionCompare = this.compareVersions(b.version, a.version);
          if (versionCompare !== 0) {
            return versionCompare;
          }
          // If versions are equal, prefer the most recent file
          return b.timestamp - a.timestamp;
        });
        
        filteredPaths.push(versions[0].path);
        
        // Log filtered out versions for debugging
        if (versions.length > 1) {
          const filtered = versions.slice(1).map(v => `${v.version} (${path.basename(v.path)})`);
          console.log(`Filtered out older versions of ${packageKey}: ${filtered.join(', ')}`);
        }
      }
    }
    
    return filteredPaths.sort();
  }

  /**
   * Compare two version strings (e.g., "1.2.3.4" vs "1.2.4.0")
   * Returns: > 0 if version1 > version2, < 0 if version1 < version2, 0 if equal
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(part => parseInt(part, 10) || 0);
    const v2Parts = version2.split('.').map(part => parseInt(part, 10) || 0);
    
    // Pad arrays to same length
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    while (v1Parts.length < maxLength) v1Parts.push(0);
    while (v2Parts.length < maxLength) v2Parts.push(0);
    
    // Compare each part
    for (let i = 0; i < maxLength; i++) {
      if (v1Parts[i] > v2Parts[i]) return 1;
      if (v1Parts[i] < v2Parts[i]) return -1;
    }
    
    return 0;
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