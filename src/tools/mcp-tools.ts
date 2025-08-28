import { 
  SearchObjectsArgs, 
  GetObjectDefinitionArgs, 
  FindReferencesArgs,
  LoadPackagesArgs,
  SearchObjectsResult,
  GetObjectDefinitionResult,
  FindReferencesResult,
  LoadPackagesResult,
  ListPackagesResult
} from '../types/mcp-types';
import { ALObjectDefinition } from '../types/al-types';
import { OptimizedSymbolDatabase } from '../core/symbol-database';
import { ALPackageManager } from '../core/package-manager';

export class ALMCPTools {
  constructor(
    private database: OptimizedSymbolDatabase,
    private packageManager: ALPackageManager
  ) {}

  /**
   * Search AL objects across all loaded packages
   */
  async searchObjects(args: SearchObjectsArgs): Promise<SearchObjectsResult> {
    const startTime = Date.now();
    
    try {
      // Set default limits to prevent massive responses
      const limit = args.limit || 20; // Reduced from unlimited to 20
      const offset = args.offset || 0;
      const summaryMode = args.summaryMode !== false; // Default to summary mode
      
      // Perform the search
      const allObjects = this.database.searchObjects(
        args.pattern,
        args.objectType,
        args.packageName
      );

      // Apply pagination
      const totalFound = allObjects.length;
      const paginatedObjects = allObjects.slice(offset, offset + limit);

      // Enrich with additional data if requested
      const enrichedObjects = paginatedObjects.map(obj => {
        let enriched = { ...obj };
        
        // In summary mode, limit the detail included
        if (summaryMode) {
          // Trim properties to only essential ones
          if (enriched.Properties) {
            const essentialProps = enriched.Properties.filter(p => 
              ['Caption', 'TableType', 'DataClassification', 'LookupPageID'].includes(p.Name)
            ).slice(0, 4);
            enriched.Properties = essentialProps;
          }
          
          // Summary mode: just counts for fields/procedures
          if (args.includeFields && obj.Type === 'Table') {
            const fields = this.database.getTableFields(obj.Name);
            (enriched as any).FieldCount = fields.length;
            (enriched as any).Fields = fields.slice(0, 3); // Show first 3 fields
          }
          
          if (args.includeProcedures) {
            const procedures = this.database.getObjectProcedures(obj.Name);
            if (procedures.length > 0) {
              (enriched as any).ProcedureCount = procedures.length;
              (enriched as any).Procedures = procedures.slice(0, 3); // Show first 3 procedures
            }
          }
        } else {
          // Full mode - include everything but still apply reasonable limits
          if (args.includeFields && obj.Type === 'Table') {
            const fields = this.database.getTableFields(obj.Name);
            (enriched as any).Fields = fields.slice(0, 50); // Max 50 fields
            if (fields.length > 50) {
              (enriched as any).TotalFieldCount = fields.length;
            }
          }
          
          if (args.includeProcedures) {
            const procedures = this.database.getObjectProcedures(obj.Name);
            if (procedures.length > 0) {
              (enriched as any).Procedures = procedures.slice(0, 20); // Max 20 procedures
              if (procedures.length > 20) {
                (enriched as any).TotalProcedureCount = procedures.length;
              }
            }
          }
        }

        return enriched;
      });

      const executionTime = Date.now() - startTime;

      return {
        objects: enrichedObjects,
        totalFound,
        returned: enrichedObjects.length,
        offset,
        limit,
        hasMore: offset + limit < totalFound,
        summaryMode,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * Get complete object definition with all metadata
   */
  async getObjectDefinition(args: GetObjectDefinitionArgs): Promise<GetObjectDefinitionResult> {
    const startTime = Date.now();
    
    try {
      let object: any;
      
      // Support both objectId and objectName lookup
      if (args.objectId && args.objectType) {
        const key = `${args.objectType}:${args.objectId}`;
        object = this.database.getObjectById(key);
      } else if (args.objectName) {
        const results = this.database.searchObjects(args.objectName, args.objectType, args.packageName);
        object = results.find(o => o.Name === args.objectName);
      }
      
      if (!object) {
        const identifier = args.objectId ? `${args.objectType} ${args.objectId}` : args.objectName;
        throw new Error(`Object not found: ${identifier}`);
      }

      // If package is specified, verify it matches
      if (args.packageName && object.PackageName !== args.packageName) {
        const identifier = args.objectId ? `${args.objectType} ${args.objectId}` : args.objectName;
        throw new Error(`Object ${identifier} not found in package ${args.packageName}`);
      }

      const summaryMode = args.summaryMode !== false; // Default to summary
      const fieldLimit = args.fieldLimit || (summaryMode ? 10 : 100);
      const procedureLimit = args.procedureLimit || (summaryMode ? 10 : 50);

      // Build definition with intelligent limiting
      const definition: ALObjectDefinition = {
        ...object,
        Fields: undefined,
        Procedures: undefined,
        Dependencies: undefined,
        Keys: undefined
      };

      // Add fields for tables
      if (object.Type === 'Table' && (args.includeFields !== false)) {
        const allFields = this.database.getTableFields(object.Name);
        definition.Fields = allFields.slice(0, fieldLimit);
        if (allFields.length > fieldLimit) {
          (definition as any).TotalFieldCount = allFields.length;
          (definition as any).FieldsShown = fieldLimit;
        }
      }

      // Add procedures for codeunits
      if (args.includeProcedures !== false) {
        const allProcedures = this.database.getObjectProcedures(object.Name);
        definition.Procedures = allProcedures.slice(0, procedureLimit);
        if (allProcedures.length > procedureLimit) {
          (definition as any).TotalProcedureCount = allProcedures.length;
          (definition as any).ProceduresShown = procedureLimit;
        }
      }

      // Add keys for tables
      if (object.Type === 'Table' && (object as any).Keys) {
        definition.Keys = (object as any).Keys;
      }

      // Only include dependencies in summary mode with limits
      if (!summaryMode) {
        const allDeps = this.database.findReferences(object.Name, 'uses');
        definition.Dependencies = allDeps.slice(0, 20); // Max 20 dependencies
        if (allDeps.length > 20) {
          (definition as any).TotalDependencyCount = allDeps.length;
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        object: definition,
        summaryMode,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Get object definition failed: ${error}`);
    }
  }

  /**
   * Find references to a target object
   */
  async findReferences(args: FindReferencesArgs): Promise<FindReferencesResult> {
    const startTime = Date.now();
    
    try {
      const references = this.database.findReferences(
        args.targetName,
        args.referenceType,
        args.sourceType
      );

      const executionTime = Date.now() - startTime;

      return {
        references,
        totalFound: references.length,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Find references failed: ${error}`);
    }
  }

  /**
   * Load AL packages from specified path
   */
  async loadPackages(args: LoadPackagesArgs): Promise<LoadPackagesResult> {
    try {
      // Discover packages in the specified path
      const packagePaths = await this.packageManager.discoverPackages({
        packagesPath: args.packagesPath,
        recursive: true
      });

      if (packagePaths.length === 0) {
        throw new Error(`No AL packages found in ${args.packagesPath}`);
      }

      // Load the packages
      const result = await this.packageManager.loadPackages(
        packagePaths,
        args.forceReload || false
      );

      return result;
    } catch (error) {
      throw new Error(`Load packages failed: ${error}`);
    }
  }

  /**
   * List currently loaded packages
   */
  async listPackages(): Promise<ListPackagesResult> {
    try {
      const packages = this.packageManager.getLoadedPackages();
      
      return {
        packages,
        totalCount: packages.length
      };
    } catch (error) {
      throw new Error(`List packages failed: ${error}`);
    }
  }

  /**
   * Auto-discover .alpackages directories
   */
  async autoDiscoverPackages(rootPath: string): Promise<LoadPackagesResult> {
    try {
      // Find all .alpackages directories
      const packageDirs = await this.packageManager.autoDiscoverPackageDirectories(rootPath);
      
      if (packageDirs.length === 0) {
        throw new Error(`No .alpackages directories found under ${rootPath}`);
      }

      // Discover and load packages from all found directories
      const allPackagePaths: string[] = [];
      
      for (const packageDir of packageDirs) {
        const packages = await this.packageManager.discoverPackages({
          packagesPath: packageDir,
          recursive: false
        });
        allPackagePaths.push(...packages);
      }

      if (allPackagePaths.length === 0) {
        throw new Error('No AL packages found in discovered .alpackages directories');
      }

      // Resolve dependency order and load packages
      const orderedPackages = await this.packageManager.resolveDependencyOrder(allPackagePaths);
      const result = await this.packageManager.loadPackages(orderedPackages);

      return result;
    } catch (error) {
      throw new Error(`Auto-discover packages failed: ${error}`);
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    totalObjects: number;
    objectsByType: Record<string, number>;
    packages: number;
    lastIndexTime: number;
  }> {
    const stats = this.database.getStatistics();
    
    // Convert Map to Record for JSON serialization
    const objectsByType: Record<string, number> = {};
    for (const [type, count] of stats.objectsByType) {
      objectsByType[type] = count;
    }

    return {
      totalObjects: stats.totalObjects,
      objectsByType,
      packages: stats.packages,
      lastIndexTime: stats.lastIndexTime
    };
  }

  /**
   * Search objects by business domain
   */
  async searchByDomain(domain: string, objectTypes?: string[]): Promise<SearchObjectsResult> {
    const startTime = Date.now();
    
    try {
      // Define domain keywords
      const domainKeywords: Record<string, string[]> = {
        'Sales': ['customer', 'sales', 'invoice', 'order', 'quote', 'shipment'],
        'Purchasing': ['vendor', 'purchase', 'receipt', 'order'],
        'Finance': ['gl', 'ledger', 'account', 'balance', 'journal', 'posting'],
        'Inventory': ['item', 'inventory', 'stock', 'warehouse', 'location'],
        'Manufacturing': ['production', 'bom', 'routing', 'capacity', 'work center'],
        'Service': ['service', 'contract', 'resource', 'allocation']
      };

      const keywords = domainKeywords[domain] || [domain.toLowerCase()];
      
      // Search for objects containing domain keywords
      let allObjects = this.database.getAllObjects();
      
      // Filter by object types if specified
      if (objectTypes && objectTypes.length > 0) {
        allObjects = allObjects.filter(obj => objectTypes.includes(obj.Type));
      }
      
      // Filter by domain keywords
      const domainObjects = allObjects.filter(obj => {
        const objectName = obj.Name.toLowerCase();
        return keywords.some(keyword => objectName.includes(keyword));
      });

      const executionTime = Date.now() - startTime;

      return {
        objects: domainObjects.slice(0, 20), // Apply default limit
        totalFound: domainObjects.length,
        returned: Math.min(domainObjects.length, 20),
        offset: 0,
        limit: 20,
        hasMore: domainObjects.length > 20,
        summaryMode: true,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search by domain failed: ${error}`);
    }
  }

  /**
   * Get object extensions (page extensions, table extensions, etc.)
   */
  async getObjectExtensions(baseObjectName: string): Promise<SearchObjectsResult> {
    const startTime = Date.now();
    
    try {
      const extensions = this.database.getExtensions(baseObjectName);

      const executionTime = Date.now() - startTime;

      return {
        objects: extensions.slice(0, 20), // Apply default limit
        totalFound: extensions.length,
        returned: Math.min(extensions.length, 20),
        offset: 0,
        limit: 20,
        hasMore: extensions.length > 20,
        summaryMode: true,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Get object extensions failed: ${error}`);
    }
  }
}