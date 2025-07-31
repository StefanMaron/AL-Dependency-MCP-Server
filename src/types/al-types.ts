export type ALObjectType = 
  | 'table' 
  | 'page' 
  | 'codeunit' 
  | 'report' 
  | 'query' 
  | 'enum' 
  | 'interface' 
  | 'permissionset' 
  | 'xmlport' 
  | 'controladdin'
  | 'profile'
  | 'pagecustomization'
  | 'tableextension'
  | 'pageextension'
  | 'reportextension'
  | 'enumextension';

export type RepositoryType = 'bc-history-sandbox' | 'bc-fork' | 'al-extension' | 'local-development';

export type RelationshipType = 'extends' | 'implements' | 'uses' | 'used_by' | 'events' | 'all';

export type IDRange = 'AppSource' | 'PTE' | 'Microsoft' | string;


export type BranchType = 'bc_version' | 'feature' | 'release' | 'all';

export interface RepositoryConfig {
  type: RepositoryType;
  url?: string;
  path?: string;
  defaultBranch?: string;
  cloneDepth?: number;
  maxBranches?: number;
  autoCleanup?: boolean;
  cleanupInterval?: string;
  authTokenFile?: string;
}

export interface WorkspaceConfig {
  workspacePath?: string;
  referencePath?: string;
  watchFiles?: boolean;
  scanDepth?: number;
}

export interface SearchFilters {
  objectType?: ALObjectType;
  namespace?: string;
  idRange?: IDRange;
  branches?: string[];
  includeObsolete?: boolean;
}

export interface ObjectReference {
  type: ALObjectType;
  name: string;
  id?: number;
  namespace?: string;
  filePath: string;
  branch: string;
  lineNumber?: number;
}

export interface BranchInfo {
  name: string;
  type: BranchType;
  lastUpdated: Date;
  objectCount: number;
  size: string;
  isActive: boolean;
}

export interface RepositoryStatus {
  url?: string;
  type: RepositoryType;
  branches: BranchInfo[];
  totalObjects: number;
  indexHealth: 'healthy' | 'stale' | 'rebuilding' | 'error';
  lastSync: Date;
  cacheSize: string;
}

export interface ExtensionDependency {
  name: string;
  id: string;
  version: string;
  publisher: string;
}