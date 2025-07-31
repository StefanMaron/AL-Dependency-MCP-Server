import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { 
  RepositoryType, 
  WorkspaceConfig, 
  ExtensionDependency 
} from './types/al-types';
import { ALParser } from './al-parser';

export interface DetectionResult {
  type: RepositoryType;
  confidence: number;
  indicators: string[];
  structure: ProjectStructure;
  recommendations: string[];
}

export interface ProjectStructure {
  rootPath: string;
  appJsonFiles: AppJsonInfo[];
  alFiles: string[];
  folders: FolderStructure;
  dependencies: ExtensionDependency[];
  totalObjects: number;
  bcVersion?: string;
}

export interface AppJsonInfo {
  path: string;
  name: string;
  id: string;
  version: string;
  publisher: string;
  target: string;
  dependencies: ExtensionDependency[];
  runtime?: string;
  platform?: string;
}

export interface FolderStructure {
  source: string[];
  test: string[];
  docs: string[];
  config: string[];
  scripts: string[];
  other: string[];
}

export interface WorkspaceOverview {
  projects: ProjectInfo[];
  structure: ProjectStructure;
  recommendations: string[];
  issues: WorkspaceIssue[];
}

export interface ProjectInfo {
  name: string;
  path: string;
  type: 'extension' | 'app' | 'library';
  dependencies: ExtensionDependency[];
  objects: { [key: string]: number };
  bcVersion?: string;
}

export interface WorkspaceIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'structure' | 'dependencies' | 'versioning' | 'configuration';
  message: string;
  path?: string;
  suggestion?: string;
}

export class RepositoryDetector {
  private logger: Logger;
  private parser: ALParser;

  constructor(logger: Logger) {
    this.logger = logger;
    this.parser = new ALParser(logger);
  }

  async detectRepositoryType(repoPath: string): Promise<DetectionResult> {
    this.logger.info(`Detecting repository type for: ${repoPath}`);

    const structure = await this.analyzeProjectStructure(repoPath);
    const indicators: string[] = [];
    let type: RepositoryType = 'al-extension';
    let confidence = 0;

    // Check for BC History Sandbox repository indicators  
    if (await this.isBCHistorySandboxRepository(repoPath, structure)) {
      type = 'bc-history-sandbox';
      confidence = 95;
      indicators.push('Contains BC base application structure');
      indicators.push('Has typical BC folder organization');
      indicators.push('Managed BC history sandbox repository');
    }
    // Check for BC fork indicators
    else if (await this.isBCFork(repoPath, structure)) {
      type = 'bc-fork';
      confidence = 85;
      indicators.push('Fork of Microsoft BC repository');
      indicators.push('Contains enterprise customizations');
      indicators.push('Modified BC base objects');
    }
    // Check for local development setup
    else if (await this.isLocalDevelopment(repoPath, structure)) {
      type = 'local-development';
      confidence = 90;
      indicators.push('Local AL extension development');
      indicators.push('Single or few app.json files');
      indicators.push('Development workspace structure');
    }
    // Default to AL extension
    else {
      type = 'al-extension';
      confidence = 70;
      indicators.push('Standard AL extension project');
      indicators.push('Custom business logic');
    }

    const recommendations = this.generateRecommendations(type, structure);

    return {
      type,
      confidence,
      indicators,
      structure,
      recommendations
    };
  }

  async detectWorkspace(config: WorkspaceConfig): Promise<DetectionResult> {
    if (!config.workspacePath) {
      throw new Error('Workspace path is required for workspace detection');
    }

    return await this.detectRepositoryType(config.workspacePath);
  }

  async getWorkspaceOverview(config: WorkspaceConfig): Promise<WorkspaceOverview> {
    if (!config.workspacePath) {
      throw new Error('Workspace path is required');
    }

    this.logger.info(`Getting workspace overview for: ${config.workspacePath}`);

    const structure = await this.analyzeProjectStructure(config.workspacePath, config.scanDepth);
    const projects = await this.discoverProjects(config.workspacePath, config.scanDepth);
    const issues = await this.validateWorkspace(structure, projects, config);
    const recommendations = this.generateWorkspaceRecommendations(structure, projects, issues);

    return {
      projects,
      structure,
      recommendations,
      issues
    };
  }

  private async analyzeProjectStructure(rootPath: string, maxDepth: number = 3): Promise<ProjectStructure> {
    const appJsonFiles: AppJsonInfo[] = [];
    const alFiles: string[] = [];
    const folders: FolderStructure = {
      source: [],
      test: [],
      docs: [],
      config: [],
      scripts: [],
      other: []
    };

    await this.scanDirectory(rootPath, rootPath, 0, maxDepth, appJsonFiles, alFiles, folders);

    // Extract dependencies from app.json files
    const dependencies: ExtensionDependency[] = [];
    let bcVersion: string | undefined;

    for (const appJson of appJsonFiles) {
      dependencies.push(...appJson.dependencies);
      
      if (appJson.runtime && !bcVersion) {
        bcVersion = appJson.runtime;
      }
    }

    // Count objects by parsing AL files
    let totalObjects = 0;
    for (const alFile of alFiles.slice(0, 50)) { // Limit for performance
      try {
        const parseResult = await this.parser.parseFile(alFile, 'workspace', {
          includeObsolete: true,
          includeDetails: false,
          validateSyntax: false
        });
        totalObjects += parseResult.objects.length;
      } catch {
        // Ignore parsing errors for overview
      }
    }

    return {
      rootPath,
      appJsonFiles,
      alFiles,
      folders,
      dependencies: this.deduplicateDependencies(dependencies),
      totalObjects,
      bcVersion
    };
  }

  private async scanDirectory(
    currentPath: string,
    rootPath: string,
    depth: number,
    maxDepth: number,
    appJsonFiles: AppJsonInfo[],
    alFiles: string[],
    folders: FolderStructure
  ): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (entry.isDirectory()) {
          // Skip common ignore patterns
          if (this.shouldSkipDirectory(entry.name)) continue;

          // Categorize folders
          this.categorizeFolder(entry.name, relativePath, folders);

          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, rootPath, depth + 1, maxDepth, appJsonFiles, alFiles, folders);
        } else if (entry.isFile()) {
          if (entry.name === 'app.json') {
            try {
              const appJsonInfo = await this.parseAppJson(fullPath);
              appJsonFiles.push(appJsonInfo);
            } catch (error) {
              this.logger.warn(`Failed to parse app.json: ${fullPath}`, { error });
            }
          } else if (entry.name.toLowerCase().endsWith('.al')) {
            alFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory: ${currentPath}`, { error });
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipPatterns = [
      '.git', '.vscode', '.vs', 'node_modules', 'bin', 'obj', 
      '.alpackages', '.output', 'dist', 'build', '.artifacts'
    ];
    return skipPatterns.includes(dirName) || dirName.startsWith('.');
  }

  private categorizeFolder(folderName: string, relativePath: string, folders: FolderStructure): void {
    const name = folderName.toLowerCase();

    if (name.includes('test') || name === 'tests') {
      folders.test.push(relativePath);
    } else if (name.includes('doc') || name === 'docs' || name === 'documentation') {
      folders.docs.push(relativePath);
    } else if (name.includes('config') || name === 'conf' || name === '.vscode') {
      folders.config.push(relativePath);
    } else if (name.includes('script') || name === 'scripts' || name === 'tools') {
      folders.scripts.push(relativePath);
    } else if (name === 'src' || name === 'source' || name.includes('app')) {
      folders.source.push(relativePath);
    } else {
      folders.other.push(relativePath);
    }
  }

  private async parseAppJson(filePath: string): Promise<AppJsonInfo> {
    const content = await fs.readFile(filePath, 'utf8');
    const appJson = JSON.parse(content);

    return {
      path: filePath,
      name: appJson.name || 'Unknown',
      id: appJson.id || '',
      version: appJson.version || '1.0.0.0',
      publisher: appJson.publisher || 'Unknown',
      target: appJson.target || 'OnPrem',
      dependencies: appJson.dependencies || [],
      runtime: appJson.runtime,
      platform: appJson.platform
    };
  }

  private deduplicateDependencies(dependencies: ExtensionDependency[]): ExtensionDependency[] {
    const unique = new Map<string, ExtensionDependency>();
    
    for (const dep of dependencies) {
      const key = `${dep.publisher}.${dep.name}`;
      if (!unique.has(key) || this.compareVersions(dep.version, unique.get(key)!.version) > 0) {
        unique.set(key, dep);
      }
    }
    
    return Array.from(unique.values());
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      
      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }
    
    return 0;
  }

  private async isBCHistorySandboxRepository(repoPath: string, structure: ProjectStructure): Promise<boolean> {
    // Check for BC History Sandbox repository indicators
    const bcHistoryIndicators = [
      'Microsoft Corporation',
      'Base Application',
      'System Application',
      'Application\\.*\\.*\\.*'
    ];

    // Check app.json files for BC indicators
    for (const appJson of structure.appJsonFiles) {
      if (bcHistoryIndicators.some(indicator => 
        appJson.publisher.includes('Microsoft') ||
        appJson.name.includes('Base Application') ||
        appJson.name.includes('System Application')
      )) {
        return true;
      }
    }

    // Check folder structure for BC base application structure
    const expectedBCFolders = [
      'BaseApp', 'SystemApp', 'BusinessCentralApp'
    ];

    const allFolders = [
      ...structure.folders.source,
      ...structure.folders.other
    ].map(f => path.basename(f));

    const hasExpectedStructure = expectedBCFolders.some(folder =>
      allFolders.some(existing => existing.toLowerCase().includes(folder.toLowerCase()))
    );

    return hasExpectedStructure;
  }

  private async isBCFork(repoPath: string, structure: ProjectStructure): Promise<boolean> {
    // Check for fork indicators
    const forkIndicators = [
      'fork', 'enterprise', 'custom', 'modified'
    ];

    // Check if it has BC structure but with customizations
    const hasBCStructure = await this.isBCHistorySandboxRepository(repoPath, structure);
    
    if (!hasBCStructure) return false;

    // Check for custom modifications
    const hasCustomizations = structure.folders.other.some(folder =>
      forkIndicators.some(indicator => folder.toLowerCase().includes(indicator))
    );

    return hasCustomizations;
  }

  private async isLocalDevelopment(repoPath: string, structure: ProjectStructure): Promise<boolean> {
    // Local development typically has:
    // - Few app.json files (1-3)
    // - Development workspace structure
    // - Local dependencies

    const appJsonCount = structure.appJsonFiles.length;
    
    if (appJsonCount === 0) return false;
    if (appJsonCount > 5) return false; // Too many for local dev

    // Check for development indicators
    const devIndicators = [
      '.vscode', 'launch.json', 'settings.json'
    ];

    const hasDevSetup = structure.folders.config.some(folder =>
      devIndicators.some(indicator => folder.includes(indicator))
    );

    return hasDevSetup || appJsonCount <= 3;
  }

  private async discoverProjects(rootPath: string, maxDepth: number = 2): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    
    try {
      await this.findProjectsRecursively(rootPath, rootPath, 0, maxDepth, projects);
    } catch (error) {
      this.logger.warn('Failed to discover projects', { error });
    }

    return projects;
  }

  private async findProjectsRecursively(
    currentPath: string,
    rootPath: string,
    depth: number,
    maxDepth: number,
    projects: ProjectInfo[]
  ): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const appJsonPath = path.join(currentPath, 'app.json');
      
      if (await this.fileExists(appJsonPath)) {
        const projectInfo = await this.analyzeProject(currentPath, appJsonPath);
        projects.push(projectInfo);
        return; // Don't recurse into project subdirectories
      }

      // Continue searching in subdirectories
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
          const fullPath = path.join(currentPath, entry.name);
          await this.findProjectsRecursively(fullPath, rootPath, depth + 1, maxDepth, projects);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan for projects in: ${currentPath}`, { error });
    }
  }

  private async analyzeProject(projectPath: string, appJsonPath: string): Promise<ProjectInfo> {
    const appJsonInfo = await this.parseAppJson(appJsonPath);
    
    // Count AL objects by type
    const objects: { [key: string]: number } = {};
    const alFiles = await this.findALFilesInDirectory(projectPath);
    
    for (const alFile of alFiles.slice(0, 20)) { // Limit for performance
      try {
        const parseResult = await this.parser.parseFile(alFile, 'project', {
          includeObsolete: true,
          includeDetails: false,
          validateSyntax: false
        });
        
        for (const obj of parseResult.objects) {
          objects[obj.type] = (objects[obj.type] || 0) + 1;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    // Determine project type
    let type: 'extension' | 'app' | 'library' = 'extension';
    
    if (appJsonInfo.name.toLowerCase().includes('library') || 
        appJsonInfo.name.toLowerCase().includes('framework')) {
      type = 'library';
    } else if (Object.keys(objects).length > 10) {
      type = 'app';
    }

    return {
      name: appJsonInfo.name,
      path: projectPath,
      type,
      dependencies: appJsonInfo.dependencies,
      objects,
      bcVersion: appJsonInfo.runtime
    };
  }

  private async findALFilesInDirectory(dirPath: string): Promise<string[]> {
    const alFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
          const subFiles = await this.findALFilesInDirectory(fullPath);
          alFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.al')) {
          alFiles.push(fullPath);
        }
      }
    } catch {
      // Ignore directory access errors
    }
    
    return alFiles;
  }

  private async validateWorkspace(
    structure: ProjectStructure,
    projects: ProjectInfo[],
    config: WorkspaceConfig
  ): Promise<WorkspaceIssue[]> {
    const issues: WorkspaceIssue[] = [];

    // Check for missing app.json files
    if (structure.appJsonFiles.length === 0) {
      issues.push({
        severity: 'error',
        category: 'structure',
        message: 'No app.json files found in workspace',
        suggestion: 'Create an app.json file for your AL extension'
      });
    }

    // Check for version mismatches
    const bcVersions = new Set(projects.map(p => p.bcVersion).filter(Boolean));
    if (bcVersions.size > 1) {
      issues.push({
        severity: 'warning',
        category: 'versioning',
        message: `Multiple BC versions detected: ${Array.from(bcVersions).join(', ')}`,
        suggestion: 'Standardize on a single BC version across all projects'
      });
    }

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(projects);
    if (circularDeps.length > 0) {
      issues.push({
        severity: 'error',
        category: 'dependencies',
        message: `Circular dependencies detected: ${circularDeps.join(' -> ')}`,
        suggestion: 'Refactor to remove circular dependencies'
      });
    }

    // Check workspace structure
    if (structure.folders.source.length === 0 && structure.alFiles.length > 10) {
      issues.push({
        severity: 'info',
        category: 'structure',
        message: 'Consider organizing AL files into source folders',
        suggestion: 'Create src/ or source/ folders to organize your AL code'
      });
    }

    return issues;
  }

  private detectCircularDependencies(projects: ProjectInfo[]): string[] {
    // Simplified circular dependency detection
    const projectMap = new Map(projects.map(p => [p.name, p]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const project of projects) {
      if (!visited.has(project.name)) {
        const cycle = this.detectCycleFromProject(project.name, projectMap, visited, recursionStack, []);
        if (cycle.length > 0) {
          return cycle;
        }
      }
    }

    return [];
  }

  private detectCycleFromProject(
    projectName: string,
    projectMap: Map<string, ProjectInfo>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] {
    visited.add(projectName);
    recursionStack.add(projectName);
    path.push(projectName);

    const project = projectMap.get(projectName);
    if (project) {
      for (const dep of project.dependencies) {
        const depName = `${dep.publisher}.${dep.name}`;
        
        if (recursionStack.has(depName)) {
          return [...path, depName];
        }
        
        if (!visited.has(depName)) {
          const cycle = this.detectCycleFromProject(depName, projectMap, visited, recursionStack, [...path]);
          if (cycle.length > 0) {
            return cycle;
          }
        }
      }
    }

    recursionStack.delete(projectName);
    return [];
  }

  private generateRecommendations(type: RepositoryType, structure: ProjectStructure): string[] {
    const recommendations: string[] = [];

    switch (type) {
      case 'bc-history-sandbox':
        recommendations.push('Use shallow cloning for space efficiency');
        recommendations.push('Focus on specific BC modules for faster indexing');
        recommendations.push('Set up automated branch tracking for new BC versions');
        recommendations.push('Leverage managed BC history for reliable code access');
        break;

      case 'bc-fork':
        recommendations.push('Track upstream Microsoft changes regularly');
        recommendations.push('Document custom modifications clearly');
        recommendations.push('Use branch naming conventions for custom features');
        break;

      case 'local-development':
        recommendations.push('Enable file watching for live updates');
        recommendations.push('Configure VS Code workspace settings');
        recommendations.push('Set up local BC reference for IntelliSense');
        break;

      case 'al-extension':
        recommendations.push('Follow AL coding best practices');
        recommendations.push('Use semantic versioning for releases');
        recommendations.push('Consider AppSource compliance guidelines');
        break;
    }

    // General recommendations based on structure
    if (structure.alFiles.length > 50) {
      recommendations.push('Consider splitting large extensions into smaller modules');
    }

    if (structure.dependencies.length > 10) {
      recommendations.push('Review dependency tree for optimization opportunities');
    }

    return recommendations;
  }

  private generateWorkspaceRecommendations(
    structure: ProjectStructure,
    projects: ProjectInfo[],
    issues: WorkspaceIssue[]
  ): string[] {
    const recommendations: string[] = [];

    if (issues.some(i => i.severity === 'error')) {
      recommendations.push('Resolve critical errors before proceeding with development');
    }

    if (projects.length > 1) {
      recommendations.push('Consider using workspace files for multi-project development');
      recommendations.push('Implement consistent coding standards across all projects');
    }

    if (structure.folders.test.length === 0 && structure.alFiles.length > 20) {
      recommendations.push('Add test projects to improve code quality');
    }

    if (structure.folders.docs.length === 0) {
      recommendations.push('Create documentation for your AL extensions');
    }

    return recommendations;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Public utility methods

  async isALProject(projectPath: string): Promise<boolean> {
    const appJsonPath = path.join(projectPath, 'app.json');
    return await this.fileExists(appJsonPath);
  }

  async getBCVersion(projectPath: string): Promise<string | null> {
    try {
      const appJsonPath = path.join(projectPath, 'app.json');
      const appJsonInfo = await this.parseAppJson(appJsonPath);
      return appJsonInfo.runtime || null;
    } catch {
      return null;
    }
  }

  async getProjectDependencies(projectPath: string): Promise<ExtensionDependency[]> {
    try {
      const appJsonPath = path.join(projectPath, 'app.json');
      const appJsonInfo = await this.parseAppJson(appJsonPath);
      return appJsonInfo.dependencies;
    } catch {
      return [];
    }
  }
}