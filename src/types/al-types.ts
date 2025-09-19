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
  SourceExpr?: string;     // Field reference for control
  SourceTable?: string;    // Table reference for control
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
  Columns?: ALReportColumn[];
  DataItems?: ALDataItem[]; // Nested data items
}

export interface ALReportColumn {
  Name: string;
  SourceExpr?: string;     // Field or expression reference
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
  referenceType: string; // 'extends', 'uses', 'calls', 'table_relation', 'variable', 'parameter', 'return_type'
  packageName?: string;
  context?: string; // Additional context like field name, procedure name, control name
  details?: string; // Detailed information about the reference
}

// Field-specific reference types
export interface ALFieldReference {
  sourceObjectId: string;
  sourceObjectName: string;
  sourceObjectType: string;
  targetTableName: string;
  targetFieldName: string;
  referenceType: 'field_usage' | 'field_access' | 'field_filter' | 'table_relation' | 'table_usage';
  context?: {
    controlName?: string;     // For page controls
    procedureName?: string;   // For code references
    dataItemName?: string;    // For report data items
    elementName?: string;     // For XMLPort schema elements
    propertyName?: string;    // For property-based references
    expression?: string;      // For calculated fields or expressions
  };
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
  findFieldReferences(tableName: string, fieldName?: string): ALFieldReference[];
  findFieldUsage(tableName: string, fieldName: string): ALFieldReference[];
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