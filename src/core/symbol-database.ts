import {
  ALObject,
  ALSymbolDatabase,
  ALReference,
  ALFieldReference,
  ALField,
  ALProcedure,
  ALTable,
  ALPage,
  ALCodeunit,
  ALReport,
  ALControl,
  ALDataItem,
  ALProperty
} from '../types/al-types';

export class OptimizedSymbolDatabase implements ALSymbolDatabase {
  // Primary indices for O(1) lookups
  private objectsByName = new Map<string, ALObject[]>();
  private objectsByType = new Map<string, ALObject[]>();
  private objectsById = new Map<string, ALObject>(); // "Table:18" format
  private allObjects: ALObject[] = [];

  // Secondary indices for complex queries
  private fieldsByTable = new Map<string, ALField[]>();
  private proceduresByObject = new Map<string, ALProcedure[]>();
  private extensionsByBase = new Map<string, ALObject[]>();

  // Field reference indices
  private fieldReferencesByTarget = new Map<string, ALFieldReference[]>(); // tableName.fieldName -> references
  private fieldReferencesBySource = new Map<string, ALFieldReference[]>(); // sourceObjectId -> references
  private allFieldReferences: ALFieldReference[] = [];

  // Package-level indices
  private packageObjects = new Map<string, Set<string>>();
  private dependencyGraph = new Map<string, string[]>();

  // Performance tracking
  private lastIndexTime = 0;
  private objectCount = 0;

  /**
   * Add an object to the database with full indexing
   */
  addObject(object: ALObject, packageName: string): void {
    const key = `${object.Type}:${object.Id}`;
    
    // Store the package name on the object
    object.PackageName = packageName;
    
    // Primary indices
    this.objectsById.set(key, object);
    this.addToMapArray(this.objectsByName, object.Name.toLowerCase(), object);
    this.addToMapArray(this.objectsByType, object.Type, object);
    this.allObjects.push(object);

    // Package tracking
    if (!this.packageObjects.has(packageName)) {
      this.packageObjects.set(packageName, new Set());
    }
    this.packageObjects.get(packageName)!.add(key);

    // Type-specific indexing
    this.indexTypeSpecificData(object);

    // Extract field references from this object
    this.extractFieldReferences(object);

    this.objectCount++;
  }

  /**
   * Search objects by pattern with optional type and package filters
   */
  searchObjects(pattern?: string, type?: string, packageName?: string): ALObject[] {
    const normalizedPattern = pattern?.toLowerCase() || '*';
    let candidates: ALObject[] = [];

    // Start with name-based lookup
    if (normalizedPattern.includes('*')) {
      // Wildcard search - iterate through all names
      const regex = new RegExp(normalizedPattern.replace(/\*/g, '.*'));
      for (const [name, objects] of this.objectsByName) {
        if (regex.test(name)) {
          candidates.push(...objects);
        }
      }
    } else {
      // Exact or partial match
      for (const [name, objects] of this.objectsByName) {
        if (name.includes(normalizedPattern)) {
          candidates.push(...objects);
        }
      }
    }

    // Apply type filter
    if (type) {
      candidates = candidates.filter(obj => obj.Type === type);
    }

    // Apply package filter
    if (packageName) {
      candidates = candidates.filter(obj => obj.PackageName === packageName);
    }

    return candidates;
  }

  /**
   * Get object by ID and type
   */
  getObjectById(key: string): ALObject | undefined {
    return this.objectsById.get(key);
  }

  /**
   * Get all objects with a specific name
   */
  getObjectsByName(name: string): ALObject[] {
    return this.objectsByName.get(name.toLowerCase()) || [];
  }

  /**
   * Get all objects of a specific type
   */
  getObjectsByType(type: string): ALObject[] {
    return this.objectsByType.get(type) || [];
  }

  /**
   * Get all objects (for enumeration)
   */
  getAllObjects(): ALObject[] {
    return this.allObjects;
  }

  /**
   * Get all field references (for enumeration and debugging)
   */
  getAllFieldReferences(): ALFieldReference[] {
    return this.allFieldReferences;
  }

  /**
   * Get fields for a specific table
   */
  getTableFields(tableName: string): ALField[] {
    return this.fieldsByTable.get(tableName) || [];
  }

  /**
   * Get procedures for a specific object
   */
  getObjectProcedures(objectName: string): ALProcedure[] {
    return this.proceduresByObject.get(objectName) || [];
  }

  /**
   * Get controls for a specific page
   */
  getPageControls(objectName: string): any[] {
    const results: any[] = [];
    
    for (const obj of this.allObjects) {
      if (obj.Name === objectName && obj.Type === 'Page' && (obj as any).Controls) {
        results.push(...((obj as any).Controls));
      }
    }
    
    return results;
  }

  /**
   * Get data items for a specific report or xmlport
   */
  getDataItems(objectName: string): any[] {
    const results: any[] = [];
    
    for (const obj of this.allObjects) {
      if (obj.Name === objectName) {
        if (obj.Type === 'Report' && (obj as any).DataItems) {
          results.push(...((obj as any).DataItems));
        } else if (obj.Type === 'Query' && (obj as any).DataItems) {
          results.push(...((obj as any).DataItems));
        } else if (obj.Type === 'XmlPort' && (obj as any).Schema) {
          results.push(...((obj as any).Schema));
        }
      }
    }
    
    return results;
  }

  /**
   * Find references to a target object
   */
  findReferences(targetName: string, referenceType?: string, sourceType?: string): ALReference[] {
    const references: ALReference[] = [];
    
    // Search through all objects to find references
    for (const obj of this.allObjects) {
      const objReferences = this.findReferencesInObject(obj, targetName);
      
      // Apply filters
      let filteredRefs = objReferences;
      
      if (referenceType) {
        filteredRefs = filteredRefs.filter(ref => ref.referenceType === referenceType);
      }
      
      if (sourceType) {
        filteredRefs = filteredRefs.filter(ref => ref.sourceType === sourceType);
      }
      
      references.push(...filteredRefs);
    }
    
    return references;
  }

  /**
   * Get objects that extend a base object
   */
  getExtensions(baseObjectName: string): ALObject[] {
    return this.extensionsByBase.get(baseObjectName) || [];
  }

  /**
   * Get package names and their object counts
   */
  getPackageSummary(): Map<string, number> {
    const summary = new Map<string, number>();
    for (const [packageName, objectIds] of this.packageObjects) {
      summary.set(packageName, objectIds.size);
    }
    return summary;
  }

  /**
   * Get database statistics
   */
  getStatistics(): {
    totalObjects: number;
    objectsByType: Map<string, number>;
    packages: number;
    lastIndexTime: number;
  } {
    const objectsByType = new Map<string, number>();
    for (const [type, objects] of this.objectsByType) {
      objectsByType.set(type, objects.length);
    }

    return {
      totalObjects: this.objectCount,
      objectsByType,
      packages: this.packageObjects.size,
      lastIndexTime: this.lastIndexTime
    };
  }

  /**
   * Find field references - all references to a specific table/field
   */
  findFieldReferences(tableName: string, fieldName?: string): ALFieldReference[] {
    if (fieldName) {
      const key = `${tableName}.${fieldName}`;
      return this.fieldReferencesByTarget.get(key) || [];
    } else {
      // Return all field references for the table
      const allRefs: ALFieldReference[] = [];
      for (const [key, refs] of this.fieldReferencesByTarget) {
        if (key.startsWith(`${tableName}.`)) {
          allRefs.push(...refs);
        }
      }
      return allRefs;
    }
  }

  /**
   * Find field usage - where a specific field is used
   */
  findFieldUsage(tableName: string, fieldName: string): ALFieldReference[] {
    return this.findFieldReferences(tableName, fieldName);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.objectsByName.clear();
    this.objectsByType.clear();
    this.objectsById.clear();
    this.allObjects = [];
    this.fieldsByTable.clear();
    this.proceduresByObject.clear();
    this.extensionsByBase.clear();
    this.packageObjects.clear();
    this.dependencyGraph.clear();
    this.fieldReferencesByTarget.clear();
    this.fieldReferencesBySource.clear();
    this.allFieldReferences = [];
    this.objectCount = 0;
  }

  /**
   * Helper method to add items to map arrays
   */
  private addToMapArray<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const existing = map.get(key);
    if (existing) {
      existing.push(value);
    } else {
      map.set(key, [value]);
    }
  }

  /**
   * Index type-specific data for fast lookups
   */
  private indexTypeSpecificData(object: ALObject): void {
    switch (object.Type) {
      case 'Table':
        const table = object as ALTable;
        if (table.Fields) {
          this.fieldsByTable.set(object.Name, table.Fields);
        }
        break;
        
      case 'Page':
      case 'Codeunit':
      case 'Report':
        if ('Procedures' in object && (object as any).Procedures) {
          this.proceduresByObject.set(object.Name, (object as any).Procedures);
        }
        break;
    }

    // Check for extension relationships
    const extendsProperty = object.Properties?.find(p => p.Name === 'Extends');
    if (extendsProperty) {
      const baseObjectName = extendsProperty.Value;
      this.addToMapArray(this.extensionsByBase, baseObjectName, object);
    }
  }

  /**
   * Find references within a single object
   */
  private findReferencesInObject(sourceObject: ALObject, targetName: string): ALReference[] {
    const references: ALReference[] = [];

    // Check extension relationships
    const extendsProperty = sourceObject.Properties?.find(p => p.Name === 'Extends');
    if (extendsProperty && extendsProperty.Value === targetName) {
      references.push({
        sourceName: sourceObject.Name,
        sourceType: sourceObject.Type,
        targetName,
        targetType: 'Unknown', // Would need additional lookup to determine
        referenceType: 'extends',
        packageName: sourceObject.PackageName
      });
    }

    // Check page source table
    if (sourceObject.Type === 'Page') {
      const page = sourceObject as ALPage;
      if (page.SourceTable === targetName) {
        references.push({
          sourceName: sourceObject.Name,
          sourceType: 'Page',
          targetName,
          targetType: 'Table',
          referenceType: 'source_table',
          packageName: sourceObject.PackageName
        });
      }
    }

    // Check table relations in fields
    if (sourceObject.Type === 'Table') {
      const table = sourceObject as ALTable;
      if (table.Fields) {
        for (const field of table.Fields) {
          const tableRelationProperty = field.Properties?.find(p => p.Name === 'TableRelation');
          if (tableRelationProperty &&
              typeof tableRelationProperty.Value === 'string' &&
              tableRelationProperty.Value.includes(targetName)) {
            references.push({
              sourceName: `${sourceObject.Name}.${field.Name}`,
              sourceType: 'Field',
              targetName,
              targetType: 'Table',
              referenceType: 'table_relation',
              packageName: sourceObject.PackageName
            });
          }
        }
      }
    }

    // Check global variables for object references
    if ((sourceObject as any).Variables) {
      for (const variable of (sourceObject as any).Variables) {
        if (variable.TypeDefinition) {
          const typeDef = variable.TypeDefinition;
          const objectTypeName = this.extractObjectTypeReference(typeDef, targetName);
          if (objectTypeName) {
            references.push({
              sourceName: sourceObject.Name,
              sourceType: sourceObject.Type,
              targetName,
              targetType: objectTypeName.type,
              referenceType: 'variable',
              packageName: sourceObject.PackageName,
              details: `Variable: ${variable.Name}`
            });
          }
        }
      }
    }

    // Check procedure parameters and return types for object references
    if ((sourceObject as any).Procedures) {
      for (const procedure of (sourceObject as any).Procedures) {
        // Check parameters
        if (procedure.Parameters) {
          for (const param of procedure.Parameters) {
            if (param.TypeDefinition) {
              const objectTypeName = this.extractObjectTypeReference(param.TypeDefinition, targetName);
              if (objectTypeName) {
                references.push({
                  sourceName: sourceObject.Name,
                  sourceType: sourceObject.Type,
                  targetName,
                  targetType: objectTypeName.type,
                  referenceType: 'parameter',
                  packageName: sourceObject.PackageName,
                  details: `Procedure: ${procedure.Name}, Parameter: ${param.Name}`
                });
              }
            }
          }
        }

        // Check return type
        if (procedure.ReturnTypeDefinition) {
          const objectTypeName = this.extractObjectTypeReference(procedure.ReturnTypeDefinition, targetName);
          if (objectTypeName) {
            references.push({
              sourceName: sourceObject.Name,
              sourceType: sourceObject.Type,
              targetName,
              targetType: objectTypeName.type,
              referenceType: 'return_type',
              packageName: sourceObject.PackageName,
              details: `Procedure: ${procedure.Name}, Return Type`
            });
          }
        }
      }
    }

    return references;
  }

  /**
   * Extract object type reference from TypeDefinition
   */
  private extractObjectTypeReference(typeDef: any, targetName: string): { type: string } | null {
    if (!typeDef || !typeDef.Name) return null;

    // Check for direct object types with subtypes
    const objectTypes = ['Record', 'Codeunit', 'Page', 'Report', 'Query', 'XmlPort', 'Enum'];
    if (objectTypes.includes(typeDef.Name)) {
      // Get the subtype reference
      let subtypeRef: string | null = null;

      if (typeDef.SubtypeDefinition) {
        subtypeRef = typeDef.SubtypeDefinition;
      } else if (typeDef.Subtype) {
        if (typeof typeDef.Subtype === 'string') {
          subtypeRef = typeDef.Subtype;
        } else if (typeDef.Subtype.Name) {
          subtypeRef = typeDef.Subtype.Name;
        } else if (typeDef.Subtype.Id) {
          // Try to resolve ID to name
          const objectKey = `${this.mapTypeToObjectType(typeDef.Name)}:${typeDef.Subtype.Id}`;
          const referencedObject = this.objectsById.get(objectKey);
          if (referencedObject) {
            subtypeRef = referencedObject.Name;
          }
        }
      }

      // Check if this subtype matches our target
      if (subtypeRef === targetName) {
        return { type: this.mapTypeToObjectType(typeDef.Name) };
      }
    }

    return null;
  }

  /**
   * Map TypeDefinition.Name to AL object type
   */
  private mapTypeToObjectType(typeName: string): string {
    switch (typeName) {
      case 'Record': return 'Table';
      case 'Codeunit': return 'Codeunit';
      case 'Page': return 'Page';
      case 'Report': return 'Report';
      case 'Query': return 'Query';
      case 'XmlPort': return 'XmlPort';
      case 'Enum': return 'Enum';
      default: return typeName;
    }
  }

  /**
   * Extract field references from an AL object
   */
  private extractFieldReferences(object: ALObject): void {
    const objectId = `${object.Type}:${object.Id}`;

    switch (object.Type) {
      case 'Page':
        this.extractPageFieldReferences(object as ALPage, objectId);
        break;
      case 'Report':
        this.extractReportFieldReferences(object as ALReport, objectId);
        break;
      case 'Query':
        this.extractQueryFieldReferences(object as any, objectId);
        break;
      case 'XmlPort':
        this.extractXmlPortFieldReferences(object as any, objectId);
        break;
      case 'Table':
        this.extractTableFieldReferences(object as ALTable, objectId);
        break;
      // Note: Codeunit field references would require parsing procedure bodies
      // which may not be available in compiled symbols
    }
  }

  /**
   * Extract field references from page controls
   */
  private extractPageFieldReferences(page: ALPage, objectId: string): void {
    if (!page.Controls) return;

    const sourceTable = this.getPageSourceTable(page);
    if (!sourceTable) return;

    this.extractControlFieldReferences(page.Controls, sourceTable, objectId, page.Name, page.PackageName);
  }

  /**
   * Recursively extract field references from controls
   */
  private extractControlFieldReferences(controls: ALControl[], sourceTable: string, objectId: string, objectName: string, packageName?: string): void {
    for (const control of controls) {
      // Check SourceExpression property for field references
      const sourceExpr = this.getPropertyValue(control.Properties, 'SourceExpression') ||
                        this.getPropertyValue(control.Properties, 'SourceExpr') ||
                        control.SourceExpr;
      if (sourceExpr && typeof sourceExpr === 'string') {
        const fieldName = this.parseFieldFromExpression(sourceExpr);
        if (fieldName) {
          this.addFieldReference({
            sourceObjectId: objectId,
            sourceObjectName: objectName,
            sourceObjectType: 'Page',
            targetTableName: sourceTable,
            targetFieldName: fieldName,
            referenceType: 'field_usage',
            context: {
              controlName: control.Name,
              propertyName: 'SourceExpression',
              expression: sourceExpr
            },
            packageName
          });
        }
      }

      // Process nested controls
      if (control.Controls) {
        this.extractControlFieldReferences(control.Controls, sourceTable, objectId, objectName, packageName);
      }
    }
  }

  /**
   * Extract field references from report data items and columns
   */
  private extractReportFieldReferences(report: ALReport, objectId: string): void {
    if (!report.Dataset) return;

    for (const dataItem of report.Dataset) {
      if (dataItem.SourceTable) {
        let foundColumnReferences = false;

        // Extract column references - only use SourceExpr if explicitly provided
        if ('Columns' in dataItem && (dataItem as any).Columns) {
          for (const column of (dataItem as any).Columns) {
            const sourceExpr = column.SourceExpr || column.SourceExpression;
            if (sourceExpr && typeof sourceExpr === 'string' && sourceExpr !== 'none') {
              const fieldName = this.parseFieldFromExpression(sourceExpr);
              if (fieldName) {
                foundColumnReferences = true;
                this.addFieldReference({
                  sourceObjectId: objectId,
                  sourceObjectName: report.Name,
                  sourceObjectType: 'Report',
                  targetTableName: dataItem.SourceTable,
                  targetFieldName: fieldName,
                  referenceType: 'field_usage',
                  context: {
                    dataItemName: dataItem.Name,
                    propertyName: 'SourceExpression',
                    expression: sourceExpr
                  },
                  packageName: report.PackageName
                });
              }
            }
          }
        }

        // If no specific column references found, but report uses the table,
        // it still has access to all table fields - this is useful information
        if (!foundColumnReferences) {
          this.addFieldReference({
            sourceObjectId: objectId,
            sourceObjectName: report.Name,
            sourceObjectType: 'Report',
            targetTableName: dataItem.SourceTable,
            targetFieldName: '*', // Indicates access to all fields
            referenceType: 'table_usage',
            context: {
              dataItemName: dataItem.Name,
              propertyName: 'SourceTable',
              expression: dataItem.SourceTable
            },
            packageName: report.PackageName
          });
        }
      }
    }
  }

  /**
   * Extract field references from query data items and columns
   */
  private extractQueryFieldReferences(query: any, objectId: string): void {
    // Check for DataItems in query
    if (query.DataItems) {
      for (const dataItem of query.DataItems) {
        if (dataItem.DataItemTable) {
          this.addFieldReference({
            sourceObjectId: objectId,
            sourceObjectName: query.Name,
            sourceObjectType: 'Query',
            targetTableName: dataItem.DataItemTable,
            targetFieldName: '*',
            referenceType: 'table_usage',
            context: {
              dataItemName: dataItem.Name,
              propertyName: 'DataItemTable',
              expression: dataItem.DataItemTable
            },
            packageName: query.PackageName
          });
        }
      }
    }

    // Check for Columns in query
    if (query.Columns) {
      for (const column of query.Columns) {
        if (column.DataSource) {
          // DataSource format is typically "DataItem.FieldName"
          const parts = column.DataSource.split('.');
          if (parts.length === 2) {
            const fieldName = parts[1];
            // Try to find which data item this refers to
            if (query.DataItems) {
              const dataItem = query.DataItems.find((di: any) => di.Name === parts[0]);
              if (dataItem && dataItem.DataItemTable) {
                this.addFieldReference({
                  sourceObjectId: objectId,
                  sourceObjectName: query.Name,
                  sourceObjectType: 'Query',
                  targetTableName: dataItem.DataItemTable,
                  targetFieldName: fieldName,
                  referenceType: 'field_usage',
                  context: {
                    dataItemName: parts[0],
                    propertyName: 'DataSource',
                    expression: column.DataSource
                  },
                  packageName: query.PackageName
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * Extract field references from XMLPort schema elements
   */
  private extractXmlPortFieldReferences(xmlport: any, objectId: string): void {
    // Check for Schema elements in XMLPort
    if (xmlport.Schema) {
      for (const element of xmlport.Schema) {
        if (element.SourceTable) {
          this.addFieldReference({
            sourceObjectId: objectId,
            sourceObjectName: xmlport.Name,
            sourceObjectType: 'XmlPort',
            targetTableName: element.SourceTable,
            targetFieldName: '*',
            referenceType: 'table_usage',
            context: {
              elementName: element.Name,
              propertyName: 'SourceTable',
              expression: element.SourceTable
            },
            packageName: xmlport.PackageName
          });
        }
      }
    }
  }

  /**
   * Extract field references from table relations
   */
  private extractTableFieldReferences(table: ALTable, objectId: string): void {
    if (!table.Fields) return;

    for (const field of table.Fields) {
      const tableRelation = this.getPropertyValue(field.Properties, 'TableRelation');
      if (tableRelation && typeof tableRelation === 'string') {
        // Parse table relation to extract referenced table and field
        const parsed = this.parseTableRelation(tableRelation);
        if (parsed) {
          this.addFieldReference({
            sourceObjectId: objectId,
            sourceObjectName: table.Name,
            sourceObjectType: 'Table',
            targetTableName: parsed.tableName,
            targetFieldName: parsed.fieldName || 'No.', // Default to primary key
            referenceType: 'table_relation',
            context: {
              propertyName: 'TableRelation',
              expression: tableRelation
            },
            packageName: table.PackageName
          });
        }
      }
    }
  }

  /**
   * Add a field reference to the indices
   */
  private addFieldReference(reference: ALFieldReference): void {
    this.allFieldReferences.push(reference);

    // Index by target (table.field)
    const targetKey = `${reference.targetTableName}.${reference.targetFieldName}`;
    this.addToMapArray(this.fieldReferencesByTarget, targetKey, reference);

    // Index by source object
    this.addToMapArray(this.fieldReferencesBySource, reference.sourceObjectId, reference);
  }

  /**
   * Get page source table from properties and resolve table ID to name
   */
  private getPageSourceTable(page: ALPage): string | undefined {
    const sourceTableProp = this.getPropertyValue(page.Properties, 'SourceTable');
    const sourceTableValue = sourceTableProp || page.SourceTable;

    if (!sourceTableValue) return undefined;

    // If it's a number (table ID), resolve to table name
    if (typeof sourceTableValue === 'number' || /^\d+$/.test(sourceTableValue.toString())) {
      const tableId = parseInt(sourceTableValue.toString());
      const tableKey = `Table:${tableId}`;
      const tableObj = this.objectsById.get(tableKey);
      return tableObj ? tableObj.Name : undefined;
    }

    // If it's already a table name, return as-is
    return sourceTableValue.toString();
  }

  /**
   * Get property value by name
   */
  private getPropertyValue(properties: ALProperty[] | undefined, name: string): any {
    if (!properties) return undefined;
    const prop = properties.find(p => p.Name === name);
    return prop ? prop.Value : undefined;
  }

  /**
   * Parse field name from expression (e.g., "No." from "Rec.\"No.\"")
   */
  private parseFieldFromExpression(expression: string): string | undefined {
    // Handle quoted field names: Rec."Field Name" or "Field Name"
    const quotedMatch = expression.match(/"([^"]+)"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Handle simple field names: Rec.FieldName or FieldName
    const simpleMatch = expression.match(/(?:Rec\.)?([A-Za-z][A-Za-z0-9_]*)/);
    if (simpleMatch) {
      return simpleMatch[1];
    }

    return undefined;
  }


  /**
   * Parse table relation string to extract table and field references
   */
  private parseTableRelation(tableRelation: string): { tableName: string; fieldName?: string } | undefined {
    // Simple table reference: "Customer"
    if (!tableRelation.includes('.')) {
      return { tableName: tableRelation.replace(/"/g, '') };
    }

    // Table.Field reference: "Customer"."No."
    const match = tableRelation.match(/"?([^".\.]+)"?\."?([^"]+)"?/);
    if (match) {
      return {
        tableName: match[1],
        fieldName: match[2]
      };
    }

    return undefined;
  }

  /**
   * Build final optimized indices (called after all objects are added)
   */
  buildOptimizedIndices(): void {
    const start = Date.now();

    // Sort objects by name for faster binary search (future optimization)
    for (const [name, objects] of this.objectsByName) {
      objects.sort((a, b) => a.Name.localeCompare(b.Name));
    }

    // Sort objects by type
    for (const [type, objects] of this.objectsByType) {
      objects.sort((a, b) => a.Id - b.Id);
    }

    this.lastIndexTime = Date.now() - start;
  }
}