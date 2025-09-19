// MCP Tool definitions for AL server

import { ALObject, ALObjectDefinition, ALReference, ALFieldReference, ALPackageInfo, ALPackageLoadResult } from './al-types';

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

export interface SearchProceduresArgs extends MCPToolArgs {
  objectName: string;
  objectType?: string;
  procedurePattern?: string;
  limit?: number;
  offset?: number;
  includeDetails?: boolean;
}

export interface SearchFieldsArgs extends MCPToolArgs {
  objectName: string;
  fieldPattern?: string;
  limit?: number;
  offset?: number;
  includeDetails?: boolean;
}

export interface SearchControlsArgs extends MCPToolArgs {
  objectName: string;
  controlPattern?: string;
  limit?: number;
  offset?: number;
  includeDetails?: boolean;
}

export interface SearchDataItemsArgs extends MCPToolArgs {
  objectName: string;
  dataItemPattern?: string;
  limit?: number;
  offset?: number;
  includeDetails?: boolean;
}

// Field reference tool arguments
export interface FindFieldReferencesArgs extends MCPToolArgs {
  tableName: string;
  fieldName?: string;
  referenceType?: 'field_usage' | 'field_access' | 'field_filter' | 'table_relation' | 'table_usage';
  sourceType?: string;
  includeContext?: boolean;
}

export interface FindFieldUsageArgs extends MCPToolArgs {
  tableName: string;
  fieldName: string;
  includePages?: boolean;
  includeReports?: boolean;
  includeCode?: boolean;
  summaryMode?: boolean;
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

export interface SearchProceduresResult {
  objectName: string;
  objectType: string;
  procedures: any[];
  totalFound: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  executionTimeMs: number;
}

export interface SearchFieldsResult {
  objectName: string;
  fields: any[];
  totalFound: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  executionTimeMs: number;
}

export interface SearchControlsResult {
  objectName: string;
  objectType: string;
  controls: any[];
  totalFound: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  executionTimeMs: number;
}

export interface SearchDataItemsResult {
  objectName: string;
  objectType: string;
  dataItems: any[];
  totalFound: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  executionTimeMs: number;
}

// Field reference tool results
export interface FindFieldReferencesResult {
  tableName: string;
  fieldName?: string;
  references: ALFieldReference[];
  totalFound: number;
  summary: {
    byReferenceType: Record<string, number>;
    bySourceType: Record<string, number>;
    byPackage: Record<string, number>;
  };
  executionTimeMs: number;
}

export interface FindFieldUsageResult {
  tableName: string;
  fieldName: string;
  usage: {
    pages: ALFieldReference[];
    reports: ALFieldReference[];
    codeunits: ALFieldReference[];
    other: ALFieldReference[];
  };
  totalUsages: number;
  executionTimeMs: number;
}