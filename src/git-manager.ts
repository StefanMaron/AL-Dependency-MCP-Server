import simpleGit, { SimpleGit, CleanOptions } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { Mutex } from 'async-mutex';
import { RepositoryConfig, BranchInfo, RepositoryStatus, BranchType } from './types/al-types';

export interface BranchAddResult {
  name: string;
  type: BranchType;
  objectCount: number;
  size: string;
}

export interface BranchAddOptions {
  shallow: boolean;
  autoDetectType: boolean;
}

export interface BranchRemoveOptions {
  cleanupLocal: boolean;
}

export interface BranchListOptions {
  filter?: string;
  include_remote?: boolean;
  branch_type?: BranchType;
}

export class GitManager {
  private git: SimpleGit;
  private logger: Logger;
  private repoPath: string;
  private config: RepositoryConfig | null = null;
  private mutex = new Mutex();
  private branches: Map<string, BranchInfo> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.repoPath = process.env.REPO_CACHE_PATH || path.join(process.cwd(), '.cache', 'repo-cache');
    this.git = simpleGit();
  }

  async initialize(config: RepositoryConfig): Promise<void> {
    this.config = config;
    this.logger.info('Initializing Git Manager', { config: this.sanitizeConfig(config) });

    await this.ensureRepoPath();
    
    if (config.type === 'local-development') {
      await this.initializeLocalDevelopment(config);
    } else {
      await this.initializeRemoteRepository(config);
    }

    this.logger.info('Checking defaultBranch configuration', {
      hasDefaultBranch: !!config.defaultBranch,
      defaultBranch: config.defaultBranch,
      defaultBranchType: typeof config.defaultBranch,
      defaultBranchEmpty: config.defaultBranch === '',
      defaultBranchUndefined: config.defaultBranch === undefined,
      defaultBranchNull: config.defaultBranch === null
    });

    if (config.defaultBranch) {
      this.logger.info('Initializing default branch', { branch: config.defaultBranch });
      try {
        await this.initializeDefaultBranch(config.defaultBranch);
        this.logger.info(`Successfully initialized default branch: ${config.defaultBranch}`);
      } catch (error) {
        this.logger.error(`Failed to initialize default branch: ${config.defaultBranch}`, { 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
      }
    } else {
      this.logger.warn('No default branch specified or default branch is empty/falsy', {
        defaultBranch: config.defaultBranch,
        configKeys: Object.keys(config)
      });
    }

    if (config.autoCleanup) {
      this.setupCleanupSchedule(config.cleanupInterval || '24h');
    }
  }

  private sanitizeConfig(config: RepositoryConfig): any {
    const sanitized = { ...config };
    if (sanitized.authTokenFile) {
      sanitized.authTokenFile = '[REDACTED]';
    }
    return sanitized;
  }

  private async ensureRepoPath(): Promise<void> {
    try {
      await fs.access(this.repoPath);
    } catch {
      await fs.mkdir(this.repoPath, { recursive: true });
      this.logger.info(`Created repository cache directory: ${this.repoPath}`);
    }
  }

  private async initializeLocalDevelopment(config: RepositoryConfig): Promise<void> {
    this.logger.info('Initializing local development mode');
    
    if (config.path && await this.directoryExists(config.path)) {
      this.repoPath = config.path;
      this.git = simpleGit(this.repoPath);
      
      const isGitRepo = await this.isGitRepository(this.repoPath);
      if (!isGitRepo) {
        this.logger.warn('Local path is not a git repository, creating bare repository structure');
        await this.git.init();
      }
    } else {
      throw new Error(`Local development path not found: ${config.path}`);
    }
  }

  private async initializeRemoteRepository(config: RepositoryConfig): Promise<void> {
    if (!config.url) {
      throw new Error('Repository URL is required for remote repositories');
    }

    this.git = simpleGit(this.repoPath);
    
    const isGitRepo = await this.isGitRepository(this.repoPath);
    if (!isGitRepo) {
      // Ensure clean clone directory
      try {
        const dirContents = await fs.readdir(this.repoPath);
        if (dirContents.length > 0) {
          this.logger.info('Cleaning existing repository directory', { contents: dirContents });
          await fs.rm(this.repoPath, { recursive: true, force: true });
          await fs.mkdir(this.repoPath, { recursive: true });
        }
      } catch (cleanError) {
        this.logger.warn('Failed to clean repository directory', { error: cleanError });
      }
      
      this.logger.info('Cloning repository for the first time', { url: config.url, cloneDepth: config.cloneDepth, targetPath: this.repoPath });
      
      const cloneOptions = [
        '--no-checkout',
        '--filter=blob:none', // Partial clone for space efficiency
      ];

      // Add shallow clone if depth is specified
      if (config.cloneDepth && config.cloneDepth > 0) {
        cloneOptions.push('--depth', config.cloneDepth.toString());
      }

      // If we have a default branch, clone only that branch for efficiency
      if (config.defaultBranch) {
        cloneOptions.push('--branch', config.defaultBranch);
        cloneOptions.push('--single-branch'); // Only fetch the specific branch
      }

      try {
        if (config.authTokenFile) {
          const token = await this.readAuthToken(config.authTokenFile);
          const urlWithAuth = this.addAuthToUrl(config.url, token);
          await this.git.clone(urlWithAuth, this.repoPath, cloneOptions);
        } else {
          await this.git.clone(config.url, this.repoPath, cloneOptions);
        }
        
        this.logger.info('Repository cloned successfully');
      } catch (cloneError: any) {
        this.logger.error('Git clone failed', { 
          error: cloneError?.message || cloneError,
          cloneOptions,
          repoPath: this.repoPath,
          url: config.url 
        });
        
        // Check if the repository was actually cloned despite the error
        const dirExists = await this.directoryExists(this.repoPath);
        const gitExists = dirExists ? await this.directoryExists(path.join(this.repoPath, '.git')) : false;
        
        if (gitExists) {
          this.logger.info('Repository appears to have been cloned successfully despite error');
          // Reinitialize git with the correct path
          this.git = simpleGit(this.repoPath);
        } else {
          throw cloneError;
        }
      }

      // After initial clone with --no-checkout, we need to checkout the branch properly
      if (config.defaultBranch) {
        try {
          // Reset the repository state and checkout the branch
          await this.git.raw(['reset', '--hard', `origin/${config.defaultBranch}`]);
          this.logger.info(`Checked out default branch: ${config.defaultBranch}`);
        } catch (error) {
          this.logger.warn(`Failed to checkout default branch: ${config.defaultBranch}`, { error });
          // Try alternative checkout method
          try {
            await this.git.checkout(['-B', config.defaultBranch, `origin/${config.defaultBranch}`]);
            this.logger.info(`Successfully checked out ${config.defaultBranch} using alternative method`);
          } catch (altError) {
            this.logger.warn(`Alternative checkout also failed for ${config.defaultBranch}`, { error: altError });
          }
        }
      }

    } else {
      this.logger.info('Using existing repository cache');
      try {
        await this.git.fetch();
      } catch (error) {
        this.logger.warn('Regular fetch failed, attempting force fetch', { error });
        try {
          // Force fetch to resolve conflicts
          await this.git.fetch(['--force']);
        } catch (forceError) {
          this.logger.error('Force fetch also failed, reinitializing repository', { forceError });
          // Clear and re-clone if force fetch fails
          await fs.rm(this.repoPath, { recursive: true, force: true });
          await this.initializeRemoteRepository(config);
          return;
        }
      }
    }
  }

  private async readAuthToken(tokenFile: string): Promise<string> {
    try {
      const token = await fs.readFile(tokenFile, 'utf8');
      return token.trim();
    } catch (error) {
      throw new Error(`Failed to read auth token from ${tokenFile}: ${error}`);
    }
  }

  private addAuthToUrl(url: string, token: string): string {
    if (url.includes('github.com')) {
      return url.replace('https://github.com', `https://${token}@github.com`);
    } else if (url.includes('dev.azure.com')) {
      return url.replace('https://dev.azure.com', `https://${token}@dev.azure.com`);
    }
    return url;
  }

  private async initializeDefaultBranch(branchName: string): Promise<void> {
    try {
      // Check if we're already on the branch
      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      if (currentBranch.trim() === branchName) {
        this.logger.info(`Already on default branch: ${branchName}`);
      } else {
        // Try to checkout the branch
        await this.git.checkout([branchName]);
        this.logger.info(`Switched to default branch: ${branchName}`);
      }

      // Count objects and detect branch type
      const branchType = this.detectBranchType(branchName);
      const objectCount = await this.countALObjects(branchName);
      const size = await this.getBranchSize(branchName);

      const branchInfo: BranchInfo = {
        name: branchName,
        type: branchType,
        lastUpdated: new Date(),
        objectCount,
        size,
        isActive: true
      };

      this.branches.set(branchName, branchInfo);
      this.logger.info(`Default branch initialized: ${branchName}`, {
        type: branchType,
        objectCount,
        size
      });

    } catch (error) {
      this.logger.error(`Failed to initialize default branch: ${branchName}`, { error });
      throw error;
    }
  }

  private async isGitRepository(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async addBranch(branchName: string, options: BranchAddOptions): Promise<BranchAddResult> {
    return await this.mutex.runExclusive(async () => {
      this.logger.info(`Adding branch: ${branchName}`, { options });

      if (this.branches.has(branchName)) {
        throw new Error(`Branch ${branchName} is already tracked`);
      }

      try {
        // Check if branch exists remotely
        const remoteRefs = await this.git.listRemote(['--heads']);
        this.logger.debug(`Remote refs for branch check: ${branchName}`, { remoteRefs: remoteRefs.substring(0, 500) + '...' });
        
        // More robust branch existence check - handle both string formats
        const refPattern = `refs/heads/${branchName}`;
        const branchExists = remoteRefs.includes(refPattern);
        
        if (!branchExists) {
          this.logger.error(`Branch ${branchName} does not exist in remote repository`, { 
            availableRefs: remoteRefs.split('\n').map(line => line.split('\t')[1]).filter(Boolean).slice(0, 10)
          });
          throw new Error(`Branch ${branchName} does not exist in remote repository`);
        }

        // Use the recommended approach from repository README
        // First, add the branch to remote branches configuration
        await this.git.remote(['set-branches', '--add', 'origin', branchName]);
        
        // Then fetch with appropriate depth
        if (options.shallow) {
          await this.git.fetch(['--depth', '1']);
        } else {
          await this.git.fetch();
        }

        // Checkout the branch
        await this.git.checkout([branchName]);

        // Analyze branch
        const branchType = options.autoDetectType ? this.detectBranchType(branchName) : 'feature';
        const objectCount = await this.countALObjects(branchName);
        const size = await this.getBranchSize(branchName);

        const branchInfo: BranchInfo = {
          name: branchName,
          type: branchType,
          lastUpdated: new Date(),
          objectCount,
          size,
          isActive: true
        };

        this.branches.set(branchName, branchInfo);

        this.logger.info(`Branch added successfully: ${branchName}`, {
          type: branchType,
          objectCount,
          size
        });

        return {
          name: branchName,
          type: branchType,
          objectCount,
          size
        };

      } catch (error) {
        this.logger.error(`Failed to add branch: ${branchName}`, { error });
        throw error;
      }
    });
  }

  async removeBranch(branchName: string, options: BranchRemoveOptions): Promise<void> {
    return await this.mutex.runExclusive(async () => {
      this.logger.info(`Removing branch: ${branchName}`, { options });

      if (!this.branches.has(branchName)) {
        throw new Error(`Branch ${branchName} is not tracked`);
      }

      try {
        if (options.cleanupLocal) {
          // Switch to a different branch before deleting
          const branches = await this.git.branchLocal();
          const otherBranch = branches.all.find(b => b !== branchName && !b.startsWith('remotes/'));
          
          if (otherBranch) {
            await this.git.checkout(otherBranch);
          }

          // Delete local branch
          await this.git.deleteLocalBranch(branchName, true);
        }

        this.branches.delete(branchName);
        
        this.logger.info(`Branch removed successfully: ${branchName}`);
      } catch (error) {
        this.logger.error(`Failed to remove branch: ${branchName}`, { error });
        throw error;
      }
    });
  }

  async setRepository(config: RepositoryConfig): Promise<void> {
    this.logger.info('Setting new repository configuration');
    
    // Clean up existing repository if switching
    if (this.config && (this.config.url !== config.url || this.config.path !== config.path)) {
      await this.cleanup();
    }

    await this.initialize(config);
  }

  async listBranches(options: BranchListOptions = {}): Promise<BranchInfo[]> {
    let branches = Array.from(this.branches.values());

    if (options.filter) {
      const filterRegex = new RegExp(options.filter.replace('*', '.*'));
      branches = branches.filter(branch => filterRegex.test(branch.name));
    }

    if (options.branch_type && options.branch_type !== 'all') {
      branches = branches.filter(branch => branch.type === options.branch_type);
    }

    if (options.include_remote && this.config?.type !== 'local-development') {
      const remoteBranches = await this.getRemoteBranches();
      const remoteBranchInfos = remoteBranches
        .filter(name => !this.branches.has(name))
        .map(name => ({
          name,
          type: this.detectBranchType(name),
          lastUpdated: new Date(),
          objectCount: 0,
          size: 'unknown',
          isActive: false
        }));
      branches.push(...remoteBranchInfos);
    }

    return branches.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRepositoryStatus(): Promise<RepositoryStatus> {
    const branches = Array.from(this.branches.values());
    const totalObjects = branches.reduce((sum, branch) => sum + branch.objectCount, 0);
    const cacheSize = await this.getCacheSize();

    return {
      url: this.config?.url,
      type: this.config?.type || 'bc-history-sandbox',
      branches,
      totalObjects,
      indexHealth: 'healthy', // This would be determined by the search indexer
      lastSync: new Date(),
      cacheSize
    };
  }

  async healthCheck(): Promise<any> {
    try {
      const gitStatus = await this.git.status();
      const remoteUrl = this.config?.url ? await this.git.remote(['get-url', 'origin']) : null;
      
      return {
        status: 'healthy',
        repositoryExists: await this.isGitRepository(this.repoPath),
        trackedBranches: this.branches.size,
        remoteConnectivity: remoteUrl ? 'connected' : 'local',
        currentBranch: gitStatus.current,
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

  private async getRemoteBranches(): Promise<string[]> {
    try {
      const remoteRefs = await this.git.listRemote(['--heads']);
      return remoteRefs
        .split('\n')
        .map(line => line.split('\t')[1])
        .filter(ref => ref && ref.startsWith('refs/heads/'))
        .map(ref => ref.replace('refs/heads/', ''))
        .filter(name => name);
    } catch (error) {
      this.logger.warn('Failed to fetch remote branches', { error });
      return [];
    }
  }

  private detectBranchType(branchName: string): BranchType {
    // For BC repositories, support all localized versions: w1 (worldwide), us, at, ca, ch, cz, de, dk, es, fi, fr, gb, is, it, mx, nl, no, nz, ru, se, etc.
    if (this.config?.type === 'bc-history-sandbox' && /^(w1|us|at|ca|ch|cz|de|dk|es|fi|fr|gb|is|it|mx|nl|no|nz|ru|se)-\d+(-vNext)?$/.test(branchName)) {
      return 'bc_version';
    }
    
    // Generic branch type detection for all repositories
    if (branchName.startsWith('feature/')) return 'feature';
    if (branchName.startsWith('release/')) return 'release';
    if (branchName.startsWith('hotfix/')) return 'feature';
    if (branchName.startsWith('bugfix/')) return 'feature';
    if (['main', 'master', 'develop', 'development', 'dev'].includes(branchName)) return 'release';
    
    // For versioning patterns like v1.0, 1.0, etc.
    if (/^v?\d+\.\d+/.test(branchName)) return 'release';
    
    // Default to feature for unknown patterns
    return 'feature';
  }

  private async countALObjects(branchName: string): Promise<number> {
    try {
      await this.git.checkout(branchName);
      
      // Count .al files recursively
      const alFiles = await this.findALFiles(this.repoPath);
      return alFiles.length;
    } catch (error) {
      this.logger.warn(`Failed to count AL objects for branch: ${branchName}`, { error });
      return 0;
    }
  }

  private async findALFiles(dir: string): Promise<string[]> {
    const alFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subFiles = await this.findALFiles(fullPath);
          alFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.al')) {
          alFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors for inaccessible directories
    }
    
    return alFiles;
  }

  private async getBranchSize(branchName: string): Promise<string> {
    try {
      // This is a simplified size calculation for the current branch
      // The branchName parameter is kept for future branch-specific size calculation
      this.logger.debug(`Calculating size for branch: ${branchName}`);
      
      const alFiles = await this.findALFiles(this.repoPath);
      let totalSize = 0;
      
      for (const file of alFiles) {
        try {
          const stat = await fs.stat(file);
          totalSize += stat.size;
        } catch {
          // Ignore files that can't be accessed
        }
      }
      
      return this.formatBytes(totalSize);
    } catch (error) {
      this.logger.warn(`Failed to calculate size for branch: ${branchName}`, { error });
      return 'unknown';
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private async getCacheSize(): Promise<string> {
    try {
      const stats = await this.getDirectorySize(this.repoPath);
      return this.formatBytes(stats);
    } catch {
      return 'unknown';
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        }
      }
    } catch {
      // Ignore errors for inaccessible directories
    }
    
    return size;
  }

  private setupCleanupSchedule(interval: string): void {
    const cron = require('node-cron');
    
    let cronExpression: string;
    switch (interval) {
      case '1h':
        cronExpression = '0 * * * *';
        break;
      case '24h':
      case '1d':
        cronExpression = '0 0 * * *';
        break;
      case '7d':
      case '1w':
        cronExpression = '0 0 * * 0';
        break;
      default:
        cronExpression = '0 0 * * *'; // Default to daily
    }

    cron.schedule(cronExpression, async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        this.logger.error('Scheduled cleanup failed', { error });
      }
    });

    this.logger.info(`Cleanup scheduled with interval: ${interval}`);
  }

  private async performCleanup(): Promise<void> {
    this.logger.info('Performing repository cleanup');
    
    if (!this.config?.maxBranches || this.branches.size <= this.config.maxBranches) {
      return;
    }

    // Sort branches by last updated time and remove oldest ones
    const branches = Array.from(this.branches.entries())
      .sort(([,a], [,b]) => a.lastUpdated.getTime() - b.lastUpdated.getTime());

    const branchesToRemove = branches.slice(0, branches.length - this.config.maxBranches);
    
    for (const [branchName] of branchesToRemove) {
      try {
        await this.removeBranch(branchName, { cleanupLocal: true });
        this.logger.info(`Cleaned up branch: ${branchName}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup branch: ${branchName}`, { error });
      }
    }

    // Clean up git objects
    await this.git.raw(['gc', '--aggressive', '--prune=now']);
  }

  private async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Git Manager');
    
    try {
      if (await this.isGitRepository(this.repoPath)) {
        await this.git.clean(CleanOptions.FORCE + CleanOptions.RECURSIVE);
      }
    } catch (error) {
      this.logger.warn('Failed to clean git repository', { error });
    }
    
    this.branches.clear();
  }

  // Utility method to get current branch
  async getCurrentBranch(): Promise<string | null> {
    try {
      const status = await this.git.status();
      return status.current || null;
    } catch {
      return null;
    }
  }

  // Method to check out a specific branch
  async checkoutBranch(branchName: string): Promise<void> {
    if (!this.branches.has(branchName)) {
      throw new Error(`Branch ${branchName} is not tracked. Add it first.`);
    }
    
    await this.git.checkout(branchName);
    this.logger.info(`Checked out branch: ${branchName}`);
  }

  // Get file content from specific branch
  async getFileContent(filePath: string, branchName?: string): Promise<string> {
    try {
      if (branchName && branchName !== await this.getCurrentBranch()) {
        return await this.git.show([`${branchName}:${filePath}`]);
      } else {
        const fullPath = path.join(this.repoPath, filePath);
        return await fs.readFile(fullPath, 'utf8');
      }
    } catch (error) {
      throw new Error(`Failed to read file ${filePath} from branch ${branchName}: ${error}`);
    }
  }

  // List files in a directory from specific branch
  async listFiles(dirPath: string = '', branchName?: string, extension?: string): Promise<string[]> {
    if (branchName && branchName !== await this.getCurrentBranch()) {
      await this.checkoutBranch(branchName);
    }

    const fullDirPath = path.join(this.repoPath, dirPath);
    const files = await this.findFilesRecursively(fullDirPath, extension);
    
    return files.map(file => path.relative(this.repoPath, file));
  }

  private async findFilesRecursively(dir: string, extension?: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subFiles = await this.findFilesRecursively(fullPath, extension);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          if (!extension || entry.name.toLowerCase().endsWith(extension.toLowerCase())) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore errors for inaccessible directories
    }
    
    return files;
  }
}