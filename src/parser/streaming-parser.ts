import { Readable } from 'stream';
import { ZipFallbackExtractor } from './zip-fallback';
import { 
  ALSymbolReference, 
  ALNamespace, 
  ALObject, 
  ALTable, 
  ALPage, 
  ALCodeunit, 
  ALReport, 
  ALEnum,
  ALField,
  ALProcedure,
  ALProperty
} from '../types/al-types';

export interface ParseProgress {
  phase: string;
  processed: number;
  total?: number;
  currentObject?: string;
}

export class StreamingSymbolParser {
  private progressCallback?: (progress: ParseProgress) => void;
  private fallbackExtractor: ZipFallbackExtractor;

  constructor(progressCallback?: (progress: ParseProgress) => void) {
    this.progressCallback = progressCallback;
    this.fallbackExtractor = new ZipFallbackExtractor();
  }

  /**
   * Parse AL symbols from a symbol package (.app file containing SymbolReference.json)
   */
  async parseSymbolPackage(symbolPackagePath: string, packageName: string): Promise<ALObject[]> {
    try {
      this.reportProgress('opening', 0, undefined, 'Opening symbol package');

      this.reportProgress('extracting', 0, undefined, 'Extracting SymbolReference.json');

      const readStream = await this.fallbackExtractor.extractSymbolReference(symbolPackagePath);
      
      // Parse the JSON stream
      const objects = await this.parseSymbolStream(readStream, packageName);

      this.reportProgress('completed', objects.length, objects.length, 'Parsing completed');

      return objects;
    } catch (error) {
      throw new Error(`Failed to parse symbol package ${symbolPackagePath}: ${error}`);
    }
  }

  /**
   * Parse SymbolReference.json from a readable stream
   */
  private async parseSymbolStream(stream: Readable, packageName: string): Promise<ALObject[]> {
    return new Promise((resolve, reject) => {
      this.reportProgress('parsing', 0, undefined, 'Loading JSON data');

      // For now, let's use a simpler approach that loads the entire JSON
      // and then processes it, since the streaming approach has issues with nested namespaces
      let jsonData = '';

      stream.on('data', (chunk) => {
        jsonData += chunk.toString();
      });

      stream.on('end', () => {
        try {
          this.reportProgress('parsing', 0, undefined, 'Parsing JSON');

                    // Trim any null characters that might be at the end of the file (common in some unzipped files)
                    const cleanJsonData = jsonData.replace(/\0+$/, '');
                    const symbolReference = JSON.parse(cleanJsonData);
          // Parse the complete JSON
        //  const symbolReference = JSON.parse(jsonData);
          
          this.reportProgress('processing', 0, undefined, 'Processing AL objects');

          // Process all objects recursively
          const objects = this.processSymbolReference(symbolReference, packageName);

          this.reportProgress('completed', objects.length, objects.length, `Found ${objects.length} AL objects`);
          resolve(objects);
        } catch (error) {
          reject(new Error(`JSON parsing error: ${error}`));
        }
      });

      stream.on('error', (error) => {
        reject(new Error(`Stream reading error: ${error}`));
      });
    });
  }

  /**
   * Process complete SymbolReference JSON recursively
   */
  private processSymbolReference(symbolRef: any, packageName: string): ALObject[] {
    const objects: ALObject[] = [];
    
    // Modern format: objects are organized within namespaces
    if (symbolRef.Namespaces) {
      this.processNamespaces(symbolRef.Namespaces, objects, packageName);
    }
    
    // Legacy format: objects are directly at root level (pre-namespace AL)
    // This handles older AL packages and PTEs that don't use namespaces
    this.processObjectsAtLevel(symbolRef, objects, packageName);
    
    return objects;
  }

  /**
   * Process objects at any level (namespace or root level)
   */
  private processObjectsAtLevel(level: any, objects: ALObject[], packageName: string): void {
    if (!level || typeof level !== 'object') return;

    const objectTypes = [
      'Tables', 'Pages', 'Codeunits', 'Reports', 'Queries', 'XmlPorts',
      'Enums', 'EnumTypes', 'Interfaces', 'PermissionSets', 'ControlAddIns'
    ];
    
    for (const objectType of objectTypes) {
      if (level[objectType] && Array.isArray(level[objectType])) {
        let singularType = objectType.slice(0, -1); // Remove 's' from plural
        
        // Handle special cases
        if (objectType === 'EnumTypes') {
          singularType = 'Enum';
        } else if (objectType === 'Queries') {
          singularType = 'Query';
        } else if (objectType === 'XmlPorts') {
          singularType = 'XmlPort';
        } else if (objectType === 'ControlAddIns') {
          singularType = 'ControlAddIn';
        }
        
        this.processObjectArray(level[objectType], singularType, objects, packageName);
      }
    }
  }

  /**
   * Process namespaces recursively to find all AL objects
   */
  private processNamespaces(namespaces: any[], objects: ALObject[], packageName: string): void {
    if (!Array.isArray(namespaces)) return;

    for (const namespace of namespaces) {
      // Process direct object arrays in this namespace
      this.processObjectsAtLevel(namespace, objects, packageName);

      // Process nested namespaces recursively
      if (namespace.Namespaces && Array.isArray(namespace.Namespaces)) {
        this.processNamespaces(namespace.Namespaces, objects, packageName);
      }
    }
  }

  /**
   * Process individual data items from the JSON stream (legacy method, keeping for compatibility)
   */
  private processStreamData(data: any, objects: ALObject[], packageName: string): void {
    if (!data.key || !data.value) {
      return;
    }

    const key = data.key;
    const value = data.value;

    // Handle different object types based on the JSON path
    if (this.isObjectArray(key, value)) {
      const objectType = this.getObjectTypeFromKey(key);
      this.processObjectArray(value, objectType, objects, packageName);
    }
  }

  /**
   * Check if the current key/value pair represents an object array
   */
  private isObjectArray(key: string, value: any): boolean {
    return Array.isArray(value) && [
      'Tables', 'Pages', 'Codeunits', 'Reports', 'Queries', 'XmlPorts',
      'Enums', 'EnumTypes', 'Interfaces', 'PermissionSets', 'ControlAddIns'
    ].some(objType => key.endsWith(objType));
  }

  /**
   * Extract object type from JSON key
   */
  private getObjectTypeFromKey(key: string): string {
    const segments = key.split('.');
    const lastSegment = segments[segments.length - 1];
    
    // Convert plural to singular
    const typeMap: Record<string, string> = {
      'Tables': 'Table',
      'Pages': 'Page',
      'Codeunits': 'Codeunit',
      'Reports': 'Report',
      'Queries': 'Query',
      'XmlPorts': 'XmlPort',
      'Enums': 'Enum',
      'EnumTypes': 'Enum',
      'Interfaces': 'Interface',
      'PermissionSets': 'PermissionSet',
      'ControlAddIns': 'ControlAddIn'
    };

    return typeMap[lastSegment] || lastSegment;
  }

  /**
   * Process an array of AL objects
   */
  private processObjectArray(
    objects: any[], 
    objectType: string, 
    targetArray: ALObject[], 
    packageName: string
  ): void {
    for (const objData of objects) {
      try {
        const alObject = this.parseALObject(objData, objectType, packageName);
        if (alObject) {
          targetArray.push(alObject);
        }
      } catch (error) {
        console.warn(`Failed to parse ${objectType} object:`, error);
      }
    }
  }

  /**
   * Parse a single AL object from raw JSON data
   */
  private parseALObject(data: any, objectType: string, packageName: string): ALObject | null {
    if (!data.Id || !data.Name) {
      return null;
    }

    const baseObject: ALObject = {
      Id: data.Id,
      Name: data.Name,
      Type: objectType,
      Properties: this.parseProperties(data.Properties),
      ReferenceSourceFileName: data.ReferenceSourceFileName,
      PackageName: packageName
    };

    // Type-specific parsing
    switch (objectType) {
      case 'Table':
        return this.parseTable(data, baseObject) as ALTable;
      case 'Page':
        return this.parsePage(data, baseObject) as ALPage;
      case 'Codeunit':
        return this.parseCodeunit(data, baseObject) as ALCodeunit;
      case 'Report':
        return this.parseReport(data, baseObject) as ALReport;
      case 'Enum':
        return this.parseEnum(data, baseObject) as ALEnum;
      case 'Query':
        return this.parseQuery(data, baseObject);
      case 'XmlPort':
        return this.parseXmlPort(data, baseObject);
      case 'ControlAddIn':
        return this.parseControlAddIn(data, baseObject);
      default:
        return baseObject;
    }
  }

  /**
   * Parse table-specific data
   */
  private parseTable(data: any, baseObject: ALObject): ALTable {
    const table = baseObject as ALTable;
    
    if (data.Fields) {
      table.Fields = data.Fields.map((fieldData: any) => this.parseField(fieldData));
    }

    if (data.Keys) {
      table.Keys = data.Keys.map((keyData: any) => ({
        Fields: keyData.FieldNames || keyData.Fields || [],
        Properties: this.parseProperties(keyData.Properties),
        Name: keyData.Name
      }));
    }

    return table;
  }

  /**
   * Parse page-specific data
   */
  private parsePage(data: any, baseObject: ALObject): ALPage {
    const page = baseObject as ALPage;
    
    // Extract source table from properties
    const sourceTableProperty = this.findProperty(data.Properties, 'SourceTable');
    if (sourceTableProperty) {
      page.SourceTable = sourceTableProperty.Value;
    }

    // TODO: Parse controls hierarchy
    if (data.Controls) {
      page.Controls = data.Controls.map((controlData: any) => this.parseControl(controlData));
    }

    return page;
  }

  /**
   * Parse codeunit-specific data
   */
  private parseCodeunit(data: any, baseObject: ALObject): ALCodeunit {
    const codeunit = baseObject as ALCodeunit;
    
    // AL symbol files use "Methods" instead of "Procedures"
    if (data.Methods) {
      codeunit.Procedures = data.Methods.map((methodData: any) => this.parseProcedure(methodData));
    } else if (data.Procedures) {
      codeunit.Procedures = data.Procedures.map((procData: any) => this.parseProcedure(procData));
    }

    return codeunit;
  }

  /**
   * Parse report-specific data
   */
  private parseReport(data: any, baseObject: ALObject): ALReport {
    const report = baseObject as ALReport;

    // Check for both Dataset (older format) and DataItems (newer format)
    const dataItems = data.Dataset || data.DataItems;
    if (dataItems) {
      report.Dataset = dataItems.map((dataItem: any) => ({
        Name: dataItem.Name || '',
        SourceTable: dataItem.SourceTable || dataItem.RelatedTable,
        Properties: this.parseProperties(dataItem.Properties),
        Columns: dataItem.Columns ? dataItem.Columns.map((column: any) => ({
          Name: column.Name || '',
          SourceExpr: column.SourceExpr || column.SourceExpression,
          Properties: this.parseProperties(column.Properties)
        })) : undefined,
        DataItems: dataItem.DataItems ? this.parseDataItems(dataItem.DataItems) : undefined
      }));
    }

    return report;
  }

  /**
   * Parse nested data items recursively
   */
  private parseDataItems(dataItems: any[]): any[] {
    return dataItems.map((dataItem: any) => ({
      Name: dataItem.Name || '',
      SourceTable: dataItem.SourceTable || dataItem.RelatedTable,
      Properties: this.parseProperties(dataItem.Properties),
      Columns: dataItem.Columns ? dataItem.Columns.map((column: any) => ({
        Name: column.Name || '',
        SourceExpr: column.SourceExpr || column.SourceExpression,
        Properties: this.parseProperties(column.Properties)
      })) : undefined,
      DataItems: dataItem.DataItems ? this.parseDataItems(dataItem.DataItems) : undefined
    }));
  }

  /**
   * Parse enum-specific data
   */
  private parseEnum(data: any, baseObject: ALObject): ALEnum {
    const enumObj = baseObject as ALEnum;
    
    if (data.Values) {
      enumObj.Values = data.Values.map((valueData: any) => ({
        Id: valueData.Id || 0,
        Name: valueData.Name || '',
        Properties: this.parseProperties(valueData.Properties)
      }));
    }

    return enumObj;
  }

  /**
   * Parse query-specific data
   */
  private parseQuery(data: any, baseObject: ALObject): ALObject {
    const query = baseObject;

    // Handle Elements structure (actual format in symbol files)
    if (data.Elements) {
      (query as any).DataItems = data.Elements.map((element: any) => ({
        Name: element.Name || '',
        DataItemTable: element.RelatedTable,
        Properties: this.parseProperties(element.Properties),
        DataItemLink: element.DataItemLink
      }));

      // Extract columns from elements
      const allColumns: any[] = [];
      data.Elements.forEach((element: any) => {
        if (element.Columns) {
          element.Columns.forEach((column: any) => {
            allColumns.push({
              Name: column.Name || '',
              DataSource: `${element.Name}.${column.SourceColumn || column.Name}`,
              Properties: this.parseProperties(column.Properties)
            });
          });
        }
      });

      if (allColumns.length > 0) {
        (query as any).Columns = allColumns;
      }
    }

    // Legacy format (if it exists)
    if (data.DataItems) {
      (query as any).DataItems = data.DataItems.map((dataItem: any) => ({
        Name: dataItem.Name || '',
        DataItemTable: dataItem.DataItemTable,
        Properties: this.parseProperties(dataItem.Properties),
        DataItemLink: dataItem.DataItemLink
      }));
    }

    if (data.Columns) {
      (query as any).Columns = data.Columns.map((column: any) => ({
        Name: column.Name || '',
        DataSource: column.DataSource,
        Properties: this.parseProperties(column.Properties)
      }));
    }

    return query;
  }

  /**
   * Parse XmlPort-specific data
   */
  private parseXmlPort(data: any, baseObject: ALObject): ALObject {
    const xmlPort = baseObject;

    // Handle actual XMLPort structure (Variables, Methods, etc.)
    if (data.Variables) {
      (xmlPort as any).Variables = data.Variables.map((variable: any) => ({
        Name: variable.Name || '',
        TypeDefinition: variable.TypeDefinition
      }));
    }

    if (data.Methods) {
      (xmlPort as any).Methods = data.Methods.map((method: any) => ({
        Name: method.Name || '',
        Parameters: method.Parameters,
        Properties: this.parseProperties(method.Properties)
      }));
    }

    // Legacy Schema format (if it exists)
    if (data.Schema) {
      (xmlPort as any).Schema = data.Schema.map((element: any) => ({
        Name: element.Name || '',
        NodeType: element.NodeType,
        Properties: this.parseProperties(element.Properties),
        SourceTable: element.SourceTable
      }));
    }

    return xmlPort;
  }

  /**
   * Parse ControlAddIn-specific data
   */
  private parseControlAddIn(data: any, baseObject: ALObject): ALObject {
    const controlAddIn = baseObject;
    
    if (data.Events) {
      (controlAddIn as any).Events = data.Events.map((event: any) => ({
        Name: event.Name || '',
        Properties: this.parseProperties(event.Properties)
      }));
    }
    
    if (data.Scripts) {
      (controlAddIn as any).Scripts = data.Scripts;
    }
    
    if (data.StyleSheets) {
      (controlAddIn as any).StyleSheets = data.StyleSheets;
    }

    return controlAddIn;
  }

  /**
   * Parse field definition
   */
  private parseField(data: any): ALField {
    return {
      Id: data.Id || 0,
      Name: data.Name || '',
      TypeDefinition: {
        Name: data.TypeDefinition?.Name || 'Unknown',
        Length: data.TypeDefinition?.Length,
        SubtypeDefinition: data.TypeDefinition?.SubtypeDefinition,
        RecordDefinition: data.TypeDefinition?.RecordDefinition
      },
      Properties: this.parseProperties(data.Properties)
    };
  }

  /**
   * Parse procedure definition
   */
  private parseProcedure(data: any): ALProcedure {
    const procedure: ALProcedure = {
      Name: data.Name || '',
      Properties: this.parseProperties(data.Properties)
    };

    if (data.ReturnTypeDefinition) {
      procedure.ReturnTypeDefinition = {
        Name: data.ReturnTypeDefinition.Name,
        Length: data.ReturnTypeDefinition.Length,
        SubtypeDefinition: data.ReturnTypeDefinition.SubtypeDefinition
      };
    }

    if (data.Parameters) {
      procedure.Parameters = data.Parameters.map((paramData: any) => ({
        Name: paramData.Name || '',
        TypeDefinition: {
          Name: paramData.TypeDefinition?.Name || 'Unknown',
          Length: paramData.TypeDefinition?.Length,
          SubtypeDefinition: paramData.TypeDefinition?.SubtypeDefinition
        },
        ByReference: paramData.ByReference || false
      }));
    }

    return procedure;
  }

  /**
   * Parse control definition (basic implementation)
   */
  private parseControl(data: any): any {
    return {
      Id: data.Id || 0,
      Name: data.Name || '',
      Type: data.Type || 'Control',
      Properties: this.parseProperties(data.Properties),
      Controls: data.Controls ? data.Controls.map((ctrl: any) => this.parseControl(ctrl)) : []
    };
  }

  /**
   * Parse properties array
   */
  private parseProperties(properties: any): ALProperty[] {
    if (!Array.isArray(properties)) {
      return [];
    }

    return properties.map(prop => ({
      Name: prop.Name || '',
      Value: prop.Value
    }));
  }

  /**
   * Find a specific property by name
   */
  private findProperty(properties: any, propertyName: string): ALProperty | undefined {
    if (!Array.isArray(properties)) {
      return undefined;
    }

    return properties.find(prop => prop.Name === propertyName);
  }

  /**
   * Report parsing progress
   */
  private reportProgress(phase: string, processed: number, total?: number, currentObject?: string): void {
    if (this.progressCallback) {
      this.progressCallback({
        phase,
        processed,
        total,
        currentObject
      });
    }
  }
}