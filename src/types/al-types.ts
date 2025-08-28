// AL Symbol Types based on SymbolReference.json structure

export interface ALSymbolReference {
  RuntimeVersion: string;
  Namespaces: ALNamespace[];
}

export interface ALNamespace {
  Name?: string;
  Tables?: ALTable[];
  Pages?: ALPage[];
  Codeunits?: ALCodeunit[];
  Reports?: ALReport[];
  Enums?: ALEnum[];
  Interfaces?: ALInterface[];
  PermissionSets?: ALPermissionSet[];
  [key: string]: any; // Additional object types
}

export interface ALObject {
  Id: number;
  Name: string;
  Type: string;
  Properties?: ALProperty[];
  ReferenceSourceFileName?: string;
  PackageName?: string;
}

export interface ALTable extends ALObject {
  Type: 'Table';
  Fields?: ALField[];
  Keys?: ALKey[];
}

export interface ALPage extends ALObject {
  Type: 'Page';
  Controls?: ALControl[];
  SourceTable?: string;
}

export interface ALCodeunit extends ALObject {
  Type: 'Codeunit';
  Procedures?: ALProcedure[];
}

export interface ALReport extends ALObject {
  Type: 'Report';
  Dataset?: ALDataItem[];
}

export interface ALEnum extends ALObject {
  Type: 'Enum';
  Values?: ALEnumValue[];
}

export interface ALInterface extends ALObject {
  Type: 'Interface';
  Procedures?: ALProcedure[];
}

export interface ALPermissionSet extends ALObject {
  Type: 'PermissionSet';
  Permissions?: ALPermission[];
}

export interface ALField {
  Id: number;
  Name: string;
  TypeDefinition: ALTypeDefinition;
  Properties: ALProperty[];
}

export interface ALKey {
  Fields: string[];
  Properties: ALProperty[];
  Name?: string;
}

export interface ALControl {
  Id: number;
  Name: string;
  Type: string;
  Properties: ALProperty[];
  Controls?: ALControl[]; // Nested controls
}

export interface ALProcedure {
  Name: string;
  ReturnTypeDefinition?: ALTypeDefinition;
  Parameters?: ALParameter[];
  Properties?: ALProperty[];
}

export interface ALParameter {
  Name: string;
  TypeDefinition: ALTypeDefinition;
  ByReference?: boolean;
}

export interface ALDataItem {
  Name: string;
  SourceTable?: string;
  Properties?: ALProperty[];
}

export interface ALEnumValue {
  Id: number;
  Name: string;
  Properties?: ALProperty[];
}

export interface ALPermission {
  ObjectType: string;
  ObjectId?: number;
  ObjectName?: string;
  ReadPermission?: boolean;
  InsertPermission?: boolean;
  ModifyPermission?: boolean;
  DeletePermission?: boolean;
}

export interface ALTypeDefinition {
  Name: string;
  Length?: number;
  SubtypeDefinition?: ALTypeDefinition;
  RecordDefinition?: ALRecordDefinition;
}

export interface ALRecordDefinition {
  TableName: string;
}

export interface ALProperty {
  Name: string;
  Value: any;
}

// Package and dependency types
export interface ALPackageInfo {
  name: string;
  id: string;
  version: string;
  publisher: string;
  dependencies: ALPackageDependency[];
  filePath: string;
}

export interface ALPackageDependency {
  name: string;
  id: string;
  version: string;
}

// Query and search types
export interface ALSearchOptions {
  pattern: string;
  objectType?: string;
  packageName?: string;
  includeFields?: boolean;
  includeProcedures?: boolean;
}

export interface ALObjectDefinition extends ALObject {
  Fields?: ALField[];
  Procedures?: ALProcedure[];
  Keys?: ALKey[];
  Dependencies?: ALReference[];
}

export interface ALReference {
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  referenceType: string; // 'extends', 'uses', 'calls', 'table_relation'
  packageName?: string;
}

// Database and indexing types
export interface ALSymbolDatabase {
  searchObjects(pattern: string, type?: string, packageName?: string): ALObject[];
  getObjectById(key: string): ALObject | undefined;
  getObjectsByName(name: string): ALObject[];
  getObjectsByType(type: string): ALObject[];
  addObject(object: ALObject, packageName: string): void;
  findReferences(targetName: string, referenceType?: string, sourceType?: string): ALReference[];
}

export interface ALPackageLoadResult {
  packages: ALPackageInfo[];
  errors: string[];
  totalObjects: number;
  loadTimeMs: number;
}

// Performance monitoring types
export interface PerformanceReport {
  averageLoadTime: number;
  queryPerformance: Map<string, number>;
  memoryUsage: NodeJS.MemoryUsage;
  packageCount: number;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}