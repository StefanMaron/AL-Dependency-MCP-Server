// MCP Tool definitions for AL server

import { ALObject, ALObjectDefinition, ALReference, ALPackageInfo, ALPackageLoadResult } from './al-types';

export interface MCPToolArgs {
  [key: string]: any;
}

// Tool argument types
export interface SearchObjectsArgs extends MCPToolArgs {
  pattern?: string;
  objectType?: string;
  packageName?: string;
  includeFields?: boolean;
  includeProcedures?: boolean;
  limit?: number;
  offset?: number;
  summaryMode?: boolean;
}

export interface GetObjectDefinitionArgs extends MCPToolArgs {
  objectId?: number;
  objectName?: string;
  objectType?: string;
  packageName?: string;
  includeFields?: boolean;
  includeProcedures?: boolean;
  summaryMode?: boolean;
  fieldLimit?: number;
  procedureLimit?: number;
}

export interface FindReferencesArgs extends MCPToolArgs {
  targetName: string;
  referenceType?: string;
  sourceType?: string;
}

export interface LoadPackagesArgs extends MCPToolArgs {
  packagesPath: string;
  forceReload?: boolean;
}

export interface GetDependenciesArgs extends MCPToolArgs {
  packageName: string;
}

export interface ResolveSymbolArgs extends MCPToolArgs {
  symbolName: string;
  fromPackage?: string;
  symbolType?: string;
}

// Tool result types
export interface SearchObjectsResult {
  objects: ALObject[];
  totalFound: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  summaryMode: boolean;
  executionTimeMs: number;
}

export interface GetObjectDefinitionResult {
  object: ALObjectDefinition;
  summaryMode?: boolean;
  executionTimeMs: number;
}

export interface FindReferencesResult {
  references: ALReference[];
  totalFound: number;
  executionTimeMs: number;
}

export interface LoadPackagesResult extends ALPackageLoadResult {
  // Inherits from ALPackageLoadResult
}

export interface ListPackagesResult {
  packages: ALPackageInfo[];
  totalCount: number;
}

export interface GetDependenciesResult {
  packageName: string;
  dependencies: ALPackageInfo[];
  dependents: ALPackageInfo[];
  dependencyTree: string[];
}