import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';
import {
  ALObject,
  ALTable,
  ALTableExtension,
  ALPage,
  ALPageExtension,
  ALCodeunit,
  ALReport,
  ALEnum,
  ALEnumExtension,
  ALInterface,
  ALPermissionSet,
  ALField,
  ALKey,
  ALTrigger,
  ALProcedure,
  ALParameter,
  ALVariable,
  ALEvent,
  ObjectReference
} from './types/al-objects';
import { ALObjectType } from './types/al-types';

export interface ParseResult {
  objects: ALObject[];
  errors: ParseError[];
  parseTime: number;
}

export interface ParseError {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseOptions {
  includeObsolete: boolean;
  includeDetails: boolean;
  validateSyntax: boolean;
}

export class ALParser {
  private logger: Logger;
  private objectPatterns!: Map<ALObjectType, RegExp>;
  private fieldPattern!: RegExp;
  private procedurePattern!: RegExp;
  private triggerPattern!: RegExp;
  private variablePattern!: RegExp;
  private eventPattern!: RegExp;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // AL object declaration patterns
    this.objectPatterns = new Map([
      ['table', /^\s*table\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['tableextension', /^\s*tableextension\s+(\d+)\s+(["\w\s\-\.]+)\s+extends\s+(["\w\s\-\.]+)\s*$/i],
      ['page', /^\s*page\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['pageextension', /^\s*pageextension\s+(\d+)\s+(["\w\s\-\.]+)\s+extends\s+(["\w\s\-\.]+)\s*$/i],
      ['codeunit', /^\s*codeunit\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['report', /^\s*report\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['query', /^\s*query\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['enum', /^\s*enum\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['enumextension', /^\s*enumextension\s+(\d+)\s+(["\w\s\-\.]+)\s+extends\s+(["\w\s\-\.]+)\s*$/i],
      ['interface', /^\s*interface\s+(["\w\s\-\.]+)\s*$/i],
      ['permissionset', /^\s*permissionset\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['xmlport', /^\s*xmlport\s+(\d+)\s+(["\w\s\-\.]+)\s*$/i],
      ['controladdin', /^\s*controladdin\s+(["\w\s\-\.]+)\s*$/i],
      ['profile', /^\s*profile\s+(["\w\s\-\.]+)\s*$/i],
      ['pagecustomization', /^\s*pagecustomization\s+(["\w\s\-\.]+)\s+customizes\s+(["\w\s\-\.]+)\s*$/i],
      ['reportextension', /^\s*reportextension\s+(\d+)\s+(["\w\s\-\.]+)\s+extends\s+(["\w\s\-\.]+)\s*$/i]
    ]);

    // Field pattern
    this.fieldPattern = /^\s*field\s*\(\s*(\d+);\s*(["\w\s]+);\s*([^)]+)\s*\)/i;

    // Procedure pattern
    this.procedurePattern = /^\s*(local\s+|internal\s+)?procedure\s+(["\w]+)\s*\(([^)]*)\)(?:\s*:\s*([^;{]+))?/i;

    // Trigger pattern
    this.triggerPattern = /^\s*trigger\s+(\w+)\s*\(([^)]*)\)/i;

    // Variable pattern
    this.variablePattern = /^\s*(\w+)\s*:\s*([^;]+);/i;

    // Event pattern (simplified)
    this.eventPattern = /^\s*\[(\w+)\]\s*$/i;
  }

  async parseFile(filePath: string, branch: string, options: ParseOptions = { includeObsolete: false, includeDetails: true, validateSyntax: false }): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseError[] = [];
    const objects: ALObject[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      let currentObject: ALObject | null = null;
      let braceLevel = 0;
      let currentSection: 'fields' | 'keys' | 'triggers' | 'procedures' | 'variables' | 'layout' | 'actions' | 'dataset' | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        try {
          // Skip comments and empty lines
          if (this.isCommentOrEmpty(line)) continue;

          // Track brace level
          braceLevel += (line.match(/{/g) || []).length;
          braceLevel -= (line.match(/}/g) || []).length;

          // Parse object declaration
          if (braceLevel === 0 && !currentObject) {
            const objectInfo = this.parseObjectDeclaration(line, filePath, lineNumber, branch);
            if (objectInfo) {
              currentObject = objectInfo;
              continue;
            }
          }

          // Parse object content
          if (currentObject && braceLevel > 0) {
            await this.parseObjectContent(currentObject, line, lineNumber, currentSection, options);
            
            // Detect section changes
            const newSection = this.detectSection(line);
            if (newSection) {
              currentSection = newSection;
            }
          }

          // Object complete
          if (currentObject && braceLevel === 0 && line.trim() === '}') {
            if (options.includeObsolete || !currentObject.isObsolete) {
              objects.push(currentObject);
            }
            currentObject = null;
            currentSection = null;
          }

        } catch (error) {
          errors.push({
            file: filePath,
            line: lineNumber,
            message: error instanceof Error ? error.message : 'Unknown parsing error',
            severity: 'error'
          });
        }
      }

    } catch (error) {
      errors.push({
        file: filePath,
        line: 0,
        message: `Failed to read file: ${error}`,
        severity: 'error'
      });
    }

    const parseTime = Date.now() - startTime;
    
    return {
      objects,
      errors,
      parseTime
    };
  }

  async parseDirectory(dirPath: string, branch: string, options: ParseOptions = { includeObsolete: false, includeDetails: true, validateSyntax: false }): Promise<ParseResult> {
    const startTime = Date.now();
    const allObjects: ALObject[] = [];
    const allErrors: ParseError[] = [];

    try {
      const alFiles = await this.findALFiles(dirPath);
      
      for (const filePath of alFiles) {
        try {
          const result = await this.parseFile(filePath, branch, options);
          allObjects.push(...result.objects);
          allErrors.push(...result.errors);
        } catch (error) {
          allErrors.push({
            file: filePath,
            line: 0,
            message: `Failed to parse file: ${error}`,
            severity: 'error'
          });
        }
      }

    } catch (error) {
      allErrors.push({
        file: dirPath,
        line: 0,
        message: `Failed to scan directory: ${error}`,
        severity: 'error'
      });
    }

    const parseTime = Date.now() - startTime;

    return {
      objects: allObjects,
      errors: allErrors,
      parseTime
    };
  }

  private async findALFiles(dirPath: string): Promise<string[]> {
    const alFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subFiles = await this.findALFiles(fullPath);
          alFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.al')) {
          alFiles.push(fullPath);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read directory: ${dirPath}`, { error });
    }
    
    return alFiles;
  }

  private isCommentOrEmpty(line: string): boolean {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  }

  private parseObjectDeclaration(line: string, filePath: string, lineNumber: number, branch: string): ALObject | null {
    for (const [objectType, pattern] of this.objectPatterns) {
      const match = line.match(pattern);
      if (match) {
        return this.createObjectFromMatch(objectType, match, filePath, lineNumber, branch);
      }
    }
    return null;
  }

  private createObjectFromMatch(objectType: ALObjectType, match: RegExpMatchArray, filePath: string, lineNumber: number, branch: string): ALObject {
    const baseObject = {
      type: objectType,
      filePath,
      lineNumber,
      branch,
      isObsolete: false
    };

    switch (objectType) {
      case 'table':
        return {
          ...baseObject,
          type: 'table',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          fields: [],
          keys: [],
          triggers: [],
          permissions: {}
        } as ALTable;

      case 'tableextension':
        return {
          ...baseObject,
          type: 'tableextension',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          extends: this.createObjectReference('table', this.cleanName(match[3])),
          fields: [],
          keys: [],
          triggers: [],
          modifications: []
        } as ALTableExtension;

      case 'page':
        return {
          ...baseObject,
          type: 'page',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          layout: [],
          actions: [],
          triggers: []
        } as ALPage;

      case 'pageextension':
        return {
          ...baseObject,
          type: 'pageextension',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          extends: this.createObjectReference('page', this.cleanName(match[3])),
          layout: [],
          actions: [],
          triggers: []
        } as ALPageExtension;

      case 'codeunit':
        return {
          ...baseObject,
          type: 'codeunit',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          procedures: [],
          triggers: [],
          variables: [],
          events: [],
          permissions: {}
        } as ALCodeunit;

      case 'report':
        return {
          ...baseObject,
          type: 'report',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          dataset: [],
          triggers: []
        } as ALReport;

      case 'enum':
        return {
          ...baseObject,
          type: 'enum',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          values: []
        } as ALEnum;

      case 'enumextension':
        return {
          ...baseObject,
          type: 'enumextension',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          extends: this.createObjectReference('enum', this.cleanName(match[3])),
          values: []
        } as ALEnumExtension;

      case 'interface':
        return {
          ...baseObject,
          type: 'interface',
          name: this.cleanName(match[1]),
          procedures: []
        } as ALInterface;

      case 'permissionset':
        return {
          ...baseObject,
          type: 'permissionset',
          id: parseInt(match[1]),
          name: this.cleanName(match[2]),
          permissions: []
        } as ALPermissionSet;

      default:
        return {
          ...baseObject,
          name: this.cleanName(match[1] || match[2] || 'Unknown'),
          id: match[1] && !isNaN(parseInt(match[1])) ? parseInt(match[1]) : undefined
        };
    }
  }

  private createObjectReference(type: ALObjectType, name: string): ObjectReference {
    return {
      type,
      name: this.cleanName(name),
      filePath: '',
      branch: '',
      namespace: this.extractNamespace(name)
    };
  }

  private cleanName(name: string): string {
    return name.replace(/["]/g, '').trim();
  }

  private extractNamespace(name: string): string | undefined {
    const parts = name.split('.');
    return parts.length > 1 ? parts.slice(0, -1).join('.') : undefined;
  }

  private detectSection(line: string): 'fields' | 'keys' | 'triggers' | 'procedures' | 'variables' | 'layout' | 'actions' | 'dataset' | null {
    const trimmed = line.trim().toLowerCase();
    
    if (trimmed.includes('fields')) return 'fields';
    if (trimmed.includes('keys')) return 'keys';
    if (trimmed.includes('triggers')) return 'triggers';
    if (trimmed.includes('procedures')) return 'procedures';
    if (trimmed.includes('var')) return 'variables';
    if (trimmed.includes('layout')) return 'layout';
    if (trimmed.includes('actions')) return 'actions';
    if (trimmed.includes('dataset')) return 'dataset';
    
    return null;
  }

  private async parseObjectContent(
    obj: ALObject,
    line: string,
    lineNumber: number,
    currentSection: string | null,
    options: ParseOptions
  ): Promise<void> {
    // Parse properties that apply to all objects
    this.parseCommonProperties(obj, line);

    // Parse section-specific content
    if (!options.includeDetails) return;

    switch (currentSection) {
      case 'fields':
        if (obj.type === 'table' || obj.type === 'tableextension') {
          const field = this.parseField(line);
          if (field) {
            (obj as ALTable | ALTableExtension).fields.push(field);
          }
        }
        break;

      case 'procedures':
        if ('procedures' in obj) {
          const procedure = this.parseProcedure(line, lineNumber);
          if (procedure) {
            (obj as any).procedures.push(procedure);
          }
        }
        break;

      case 'triggers':
        const trigger = this.parseTrigger(line, lineNumber);
        if (trigger && 'triggers' in obj) {
          (obj as any).triggers.push(trigger);
        }
        break;

      case 'variables':
        if ('variables' in obj) {
          const variable = this.parseVariable(line);
          if (variable) {
            (obj as any).variables.push(variable);
          }
        }
        break;
    }
  }

  private parseCommonProperties(obj: ALObject, line: string): void {
    const trimmed = line.trim();

    // Parse Caption
    const captionMatch = trimmed.match(/Caption\s*=\s*'([^']+)'/i);
    if (captionMatch) {
      obj.caption = captionMatch[1];
    }

    // Parse Obsolete properties
    if (trimmed.toLowerCase().includes('obsoletestate') && trimmed.toLowerCase().includes('pending')) {
      obj.isObsolete = true;
    }

    const obsoleteReasonMatch = trimmed.match(/ObsoleteReason\s*=\s*'([^']+)'/i);
    if (obsoleteReasonMatch) {
      obj.obsoleteReason = obsoleteReasonMatch[1];
    }

    const obsoleteTagMatch = trimmed.match(/ObsoleteTag\s*=\s*'([^']+)'/i);
    if (obsoleteTagMatch) {
      obj.obsoleteTag = obsoleteTagMatch[1];
    }

    // Parse Access
    const accessMatch = trimmed.match(/Access\s*=\s*(\w+)/i);
    if (accessMatch) {
      obj.access = accessMatch[1] as 'Public' | 'Internal' | 'Local';
    }

    // Parse Extensible
    const extensibleMatch = trimmed.match(/Extensible\s*=\s*(true|false)/i);
    if (extensibleMatch) {
      obj.extensible = extensibleMatch[1].toLowerCase() === 'true';
    }
  }

  private parseField(line: string): ALField | null {
    const match = line.match(this.fieldPattern);
    if (!match) return null;

    return {
      id: parseInt(match[1]),
      name: this.cleanName(match[2]),
      type: match[3].trim(),
      editable: true,
      enabled: true
    };
  }

  private parseProcedure(line: string, lineNumber: number): ALProcedure | null {
    const match = line.match(this.procedurePattern);
    if (!match) return null;

    const access = match[1] ? (match[1].trim().toLowerCase() === 'local' ? 'Local' : 'Internal') : 'Public';
    const name = this.cleanName(match[2]);
    const paramString = match[3] || '';
    const returnType = match[4] ? match[4].trim() : undefined;

    return {
      name,
      lineNumber,
      access: access as 'Public' | 'Internal' | 'Local',
      parameters: this.parseParameters(paramString),
      returnType,
      isObsolete: false,
      isEvent: false
    };
  }

  private parseParameters(paramString: string): ALParameter[] {
    if (!paramString.trim()) return [];

    const params: ALParameter[] = [];
    const paramParts = paramString.split(';');

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const isVar = trimmed.toLowerCase().startsWith('var ');
      const cleanPart = trimmed.replace(/^var\s+/i, '');
      
      const colonIndex = cleanPart.lastIndexOf(':');
      if (colonIndex > 0) {
        const name = cleanPart.substring(0, colonIndex).trim();
        const type = cleanPart.substring(colonIndex + 1).trim();
        
        params.push({
          name,
          type,
          var: isVar,
          temporary: type.toLowerCase().includes('temporary')
        });
      }
    }

    return params;
  }

  private parseTrigger(line: string, lineNumber: number): ALTrigger | null {
    const match = line.match(this.triggerPattern);
    if (!match) return null;

    return {
      name: match[1],
      lineNumber,
      parameters: match[2] ? this.parseParameters(match[2]).map(p => p.name) : []
    };
  }

  private parseVariable(line: string): ALVariable | null {
    const match = line.match(this.variablePattern);
    if (!match) return null;

    return {
      name: match[1],
      type: match[2].trim(),
      temporary: match[2].toLowerCase().includes('temporary'),
      scope: 'Global'
    };
  }

  async healthCheck(): Promise<any> {
    try {
      // Test parsing capability with a simple AL object
      const testAL = `table 50000 "Test Table"
      {
          fields
          {
              field(1; "No."; Code[20]) { }
          }
      }`;

      const tempFile = path.join('/tmp', 'test.al');
      await fs.writeFile(tempFile, testAL);
      
      const result = await this.parseFile(tempFile, 'test', { includeObsolete: false, includeDetails: true, validateSyntax: false });
      
      // Cleanup
      await fs.unlink(tempFile);

      return {
        status: 'healthy',
        canParse: result.objects.length > 0,
        errors: result.errors.length,
        parseTime: result.parseTime,
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

  // Utility methods

  isALFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.al';
  }

  getObjectNameFromFilename(filename: string): string {
    const baseName = path.basename(filename, '.al');
    // Remove common prefixes like "Tab", "Pag", "Cod", etc.
    return baseName.replace(/^(Tab|Pag|Cod|Rep|Que|Enu|Int|Per|Xml|Con|Pro)\d*[-._]?/i, '');
  }

  // Extract AL object type from file content
  async detectObjectType(filePath: string): Promise<ALObjectType | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').slice(0, 10); // Check first 10 lines
      
      for (const line of lines) {
        for (const [objectType, pattern] of this.objectPatterns) {
          if (pattern.test(line)) {
            return objectType;
          }
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  // Get object dependencies from parsed content
  extractDependencies(obj: ALObject): ObjectReference[] {
    const dependencies: ObjectReference[] = [];

    // Add extends relationships
    if ('extends' in obj && obj.extends && typeof obj.extends === 'object' && 'type' in obj.extends && 'name' in obj.extends) {
      dependencies.push(obj.extends as ObjectReference);
    }

    // Add table relations from fields
    if ('fields' in obj && obj.fields && Array.isArray(obj.fields)) {
      for (const field of obj.fields) {
        if (field && field.tableRelation) {
          // Extract table name from table relation
          const tableName = field.tableRelation.split('.')[0].replace(/['"]/g, '');
          dependencies.push({
            type: 'table',
            name: tableName,
            filePath: '',
            branch: obj.branch
          });
        }
      }
    }

    // Add source table references
    if ('sourceTable' in obj && obj.sourceTable && typeof obj.sourceTable === 'object' && 'type' in obj.sourceTable && 'name' in obj.sourceTable) {
      dependencies.push(obj.sourceTable as ObjectReference);
    }

    return dependencies;
  }
}