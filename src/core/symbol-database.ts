import { 
  ALObject, 
  ALSymbolDatabase, 
  ALReference, 
  ALField, 
  ALProcedure,
  ALTable,
  ALPage,
  ALCodeunit
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

    return references;
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