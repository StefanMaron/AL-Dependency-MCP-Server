import { ALObjectType, ObjectReference } from './al-types';

// Re-export for convenience
export { ObjectReference };

export interface ALObject {
  type: ALObjectType;
  id?: number;
  name: string;
  namespace?: string;
  caption?: string;
  filePath: string;
  branch: string;
  lineNumber: number;
  isObsolete?: boolean;
  obsoleteReason?: string;
  obsoleteTag?: string;
  access?: 'Public' | 'Internal' | 'Local';
  extensible?: boolean;
  codePreview?: CodeSnippet;
  sourceCode?: string;
}

export interface ALTable extends ALObject {
  type: 'table';
  fields: ALField[];
  keys: ALKey[];
  triggers: ALTrigger[];
  permissions: TablePermissions;
  dataClassification?: string;
  tabletype?: 'Normal' | 'Temporary' | 'CRM';
}

export interface ALTableExtension extends ALObject {
  type: 'tableextension';
  extends: ObjectReference;
  fields: ALField[];
  keys: ALKey[];
  triggers: ALTrigger[];
  modifications: FieldModification[];
}

export interface ALField {
  id?: number;
  name: string;
  type: string;
  caption?: string;
  description?: string;
  isObsolete?: boolean;
  obsoleteReason?: string;
  dataClassification?: string;
  tableRelation?: string;
  calcFormula?: string;
  editable?: boolean;
  enabled?: boolean;
}

export interface ALKey {
  fields: string[];
  enabled?: boolean;
  clustered?: boolean;
  unique?: boolean;
  sqlIndex?: string[];
}

export interface ALTrigger {
  name: string;
  lineNumber: number;
  parameters?: string[];
  local?: boolean;
}

export interface ALPage extends ALObject {
  type: 'page';
  sourceTable?: ObjectReference;
  layout: ALControl[];
  actions: ALAction[];
  triggers: ALTrigger[];
  pageType?: string;
  usageCategory?: string;
  applicationArea?: string[];
}

export interface ALPageExtension extends ALObject {
  type: 'pageextension';
  extends: ObjectReference;
  layout: ALLayoutModification[];
  actions: ALActionModification[];
  triggers: ALTrigger[];
}

export interface ALControl {
  name: string;
  type: string;
  sourceExpr?: string;
  caption?: string;
  visible?: boolean;
  enabled?: boolean;
  editable?: boolean;
  children?: ALControl[];
}

export interface ALAction {
  name: string;
  type: string;
  caption?: string;
  image?: string;
  promoted?: boolean;
  promotedCategory?: string;
  runObject?: ObjectReference;
  triggers: ALTrigger[];
}

export interface ALCodeunit extends ALObject {
  type: 'codeunit';
  procedures: ALProcedure[];
  triggers: ALTrigger[];
  variables: ALVariable[];
  events: ALEvent[];
  subtype?: string;
  singleInstance?: boolean;
  permissions: CodeunitPermissions;
}

export interface ALProcedure {
  name: string;
  lineNumber: number;
  access?: 'Public' | 'Internal' | 'Local';
  parameters: ALParameter[];
  returnType?: string;
  isObsolete?: boolean;
  obsoleteReason?: string;
  isEvent?: boolean;
  eventType?: 'Publisher' | 'Subscriber';
  eventPublisher?: ObjectReference;
  triggers?: ALTrigger[];
  codeSnippet?: string;
  signature?: string;
}

export interface ALParameter {
  name: string;
  type: string;
  var?: boolean;
  temporary?: boolean;
}

export interface ALVariable {
  name: string;
  type: string;
  temporary?: boolean;
  scope: 'Global' | 'Local';
}

export interface ALEvent {
  name: string;
  type: 'Publisher' | 'Subscriber';
  publisher?: ObjectReference;
  lineNumber: number;
  parameters: ALParameter[];
}

export interface ALReport extends ALObject {
  type: 'report';
  dataset: ALDataItem[];
  layout?: ReportLayout;
  requestPage?: ALRequestPage;
  triggers: ALTrigger[];
  usageCategory?: string;
  applicationArea?: string[];
}

export interface ALDataItem {
  name: string;
  dataItemTable: ObjectReference;
  columns: ALColumn[];
  triggers: ALTrigger[];
}

export interface ALColumn {
  name: string;
  sourceExpr: string;
  caption?: string;
}

export interface ALEnum extends ALObject {
  type: 'enum';
  values: ALEnumValue[];
  extensible?: boolean;
}

export interface ALEnumExtension extends ALObject {
  type: 'enumextension';
  extends: ObjectReference;
  values: ALEnumValue[];
}

export interface ALEnumValue {
  id?: number;
  name: string;
  caption?: string;
  isObsolete?: boolean;
  obsoleteReason?: string;
}

export interface ALInterface extends ALObject {
  type: 'interface';
  procedures: ALProcedure[];
}

export interface ALPermissionSet extends ALObject {
  type: 'permissionset';
  permissions: Permission[];
  assignable?: boolean;
  caption?: string;
}

export interface Permission {
  objectType: ALObjectType;
  objectId: number | string;
  readPermission: PermissionValue;
  insertPermission: PermissionValue;
  modifyPermission: PermissionValue;
  deletePermission: PermissionValue;
  executePermission: PermissionValue;
}

export type PermissionValue = 'Yes' | 'No' | 'Indirect';

export interface PermissionInfo {
  objectType: ALObjectType;
  objectId: number | string;
  permissions: {
    read?: PermissionValue;
    insert?: PermissionValue;
    modify?: PermissionValue;
    delete?: PermissionValue;
    execute?: PermissionValue;
  };
}

export interface TablePermissions {
  read?: PermissionValue;
  insert?: PermissionValue;
  modify?: PermissionValue;
  delete?: PermissionValue;
}

export interface CodeunitPermissions {
  execute?: PermissionValue;
}

export interface ReportLayout {
  type: 'RDLC' | 'Word' | 'Excel';
  layoutFile?: string;
}

export interface ALRequestPage {
  controls: ALControl[];
  triggers: ALTrigger[];
}

export interface FieldModification {
  field: string;
  modifications: {
    caption?: string;
    description?: string;
    enabled?: boolean;
    visible?: boolean;
    editable?: boolean;
  };
}

export interface ALLayoutModification {
  type: 'addafter' | 'addbefore' | 'addfirst' | 'addlast' | 'modify' | 'movebefore' | 'moveafter';
  anchor?: string;
  control: ALControl;
}

export interface ALActionModification {
  type: 'addafter' | 'addbefore' | 'addfirst' | 'addlast' | 'modify';
  anchor?: string;
  action: ALAction;
}

export interface ObjectRelationship {
  source: ObjectReference;
  target: ObjectReference;
  type: 'extends' | 'implements' | 'uses' | 'publishes' | 'subscribes';
  context?: string;
  lineNumber?: number;
}

export interface DependencyGraph {
  nodes: ObjectReference[];
  edges: ObjectRelationship[];
  metadata: {
    generatedAt: Date;
    branch: string;
    totalObjects: number;
    totalRelationships: number;
  };
}

export interface CodeSnippet {
  startLine: number;
  endLine: number;
  content: string;
  highlights?: CodeHighlight[];
}

export interface CodeHighlight {
  line: number;
  column?: number;
  length?: number;
  type: 'match' | 'definition' | 'reference';
}

export interface SearchResultItem {
  object: ObjectReference;
  score: number;
  preview?: {
    fields?: string[];
    procedures?: string[];
    triggers?: string[];
    snippet?: CodeSnippet;
  };
  matches?: SearchMatch[];
  relatedObjects?: string[];
}

export interface SearchMatch {
  type: 'name' | 'caption' | 'field' | 'procedure' | 'code';
  line: number;
  content: string;
  context?: string;
}

export interface SearchResult {
  objects: ObjectReference[];
  items?: SearchResultItem[];
  totalCount: number;
  branches: string[];
  searchTime: number;
  filters: any;
  facets?: {
    types?: Record<ALObjectType, number>;
    namespaces?: Record<string, number>;
  };
}

export interface BrowseResult {
  object: ALObject;
  sourceCode: string;
  navigation: {
    procedures: Array<{ name: string; line: number; signature: string }>;
    fields?: Array<{ name: string; line: number; type: string }>;
    triggers?: Array<{ name: string; line: number }>;
  };
  references: {
    uses: ObjectReference[];
    usedBy: ObjectReference[];
  };
}