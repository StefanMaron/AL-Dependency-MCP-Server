import { 
  SearchObjectsArgs, 
  GetObjectDefinitionArgs, 
  FindReferencesArgs,
  LoadPackagesArgs,
  SearchProceduresArgs,
  SearchFieldsArgs,
  SearchControlsArgs,
  SearchDataItemsArgs,
  SearchObjectsResult,
  GetObjectDefinitionResult,
  FindReferencesResult,
  LoadPackagesResult,
  ListPackagesResult,
  SearchProceduresResult,
  SearchFieldsResult,
  SearchControlsResult,
  SearchDataItemsResult
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
   * Check if database is empty and return guidance message if needed
   */
  private checkDatabaseLoaded(): { isEmpty: boolean; message?: string } {
    const stats = this.database.getStatistics();
    if (stats.totalObjects === 0) {
      return {
        isEmpty: true,
        message: `No AL packages are currently loaded. To analyze AL objects, first load packages from your project directory using:

1. **Auto-discover from project root**: Use 'al_auto_discover' tool with your AL project root directory path (the folder containing .alpackages/ or app.json)
2. **Load from specific directory**: Use 'al_load_packages' tool with the path to your .alpackages directory

Example: If your AL project is in "/path/to/my-al-project", call al_auto_discover with rootPath="/path/to/my-al-project"

Once packages are loaded, you can search for AL objects like Customer table, Sales-Post codeunit, etc.`
      };
    }
    return { isEmpty: false };
  }

  /**
   * Search AL objects across all loaded packages
   */
  async searchObjects(args: SearchObjectsArgs): Promise<SearchObjectsResult> {
    const startTime = Date.now();
    
    try {
      // Check if database has packages loaded
      const dbCheck = this.checkDatabaseLoaded();
      if (dbCheck.isEmpty) {
        throw new Error(dbCheck.message!);
      }

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
      // Check if database has packages loaded
      const dbCheck = this.checkDatabaseLoaded();
      if (dbCheck.isEmpty) {
        throw new Error(dbCheck.message!);
      }

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

  /**
   * Search procedures within a specific object
   */
  async searchProcedures(args: SearchProceduresArgs): Promise<SearchProceduresResult> {
    const startTime = Date.now();
    
    try {
      const limit = args.limit || 20;
      const offset = args.offset || 0;
      const includeDetails = args.includeDetails !== false;
      
      // Find the object first
      const objects = this.database.searchObjects(args.objectName, args.objectType);
      const targetObject = objects.find(obj => obj.Name === args.objectName);
      
      if (!targetObject) {
        throw new Error(`Object not found: ${args.objectName}`);
      }

      // Get all procedures for the object
      let allProcedures = this.database.getObjectProcedures(targetObject.Name);
      
      // Filter by pattern if provided
      if (args.procedurePattern) {
        const pattern = args.procedurePattern.toLowerCase();
        const isWildcard = pattern.includes('*');
        
        if (isWildcard) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          allProcedures = allProcedures.filter(proc => 
            regex.test(proc.Name.toLowerCase())
          );
        } else {
          allProcedures = allProcedures.filter(proc => 
            proc.Name.toLowerCase().includes(pattern)
          );
        }
      }

      // Apply pagination
      const totalFound = allProcedures.length;
      const paginatedProcedures = allProcedures.slice(offset, offset + limit);

      // Optionally strip details to save tokens
      const procedures = paginatedProcedures.map(proc => {
        if (!includeDetails) {
          // Return minimal info
          return {
            Name: proc.Name
          };
        }
        return proc;
      });

      const executionTime = Date.now() - startTime;

      return {
        objectName: args.objectName,
        objectType: targetObject.Type,
        procedures,
        totalFound,
        returned: procedures.length,
        offset,
        limit,
        hasMore: offset + limit < totalFound,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search procedures failed: ${error}`);
    }
  }

  /**
   * Search fields within a specific table
   */
  async searchFields(args: SearchFieldsArgs): Promise<SearchFieldsResult> {
    const startTime = Date.now();
    
    try {
      // Check if database has packages loaded
      const dbCheck = this.checkDatabaseLoaded();
      if (dbCheck.isEmpty) {
        throw new Error(dbCheck.message!);
      }

      const limit = args.limit || 20;
      const offset = args.offset || 0;
      const includeDetails = args.includeDetails !== false;
      
      // Find the table
      const objects = this.database.searchObjects(args.objectName, 'Table');
      const targetTable = objects.find(obj => obj.Name === args.objectName);
      
      if (!targetTable) {
        throw new Error(`Table not found: ${args.objectName}`);
      }

      // Get all fields for the table
      let allFields = this.database.getTableFields(targetTable.Name);
      
      // Filter by pattern if provided
      if (args.fieldPattern) {
        const pattern = args.fieldPattern.toLowerCase();
        const isWildcard = pattern.includes('*');
        
        if (isWildcard) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          allFields = allFields.filter(field => 
            regex.test(field.Name.toLowerCase())
          );
        } else {
          allFields = allFields.filter(field => 
            field.Name.toLowerCase().includes(pattern)
          );
        }
      }

      // Apply pagination
      const totalFound = allFields.length;
      const paginatedFields = allFields.slice(offset, offset + limit);

      // Optionally strip details to save tokens
      const fields = paginatedFields.map(field => {
        if (!includeDetails) {
          // Return minimal info
          return {
            Id: field.Id,
            Name: field.Name,
            TypeDefinition: field.TypeDefinition
          };
        }
        return field;
      });

      const executionTime = Date.now() - startTime;

      return {
        objectName: args.objectName,
        fields,
        totalFound,
        returned: fields.length,
        offset,
        limit,
        hasMore: offset + limit < totalFound,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search fields failed: ${error}`);
    }
  }

  /**
   * Search controls within a specific page
   */
  async searchControls(args: SearchControlsArgs): Promise<SearchControlsResult> {
    const startTime = Date.now();
    
    try {
      const limit = args.limit || 20;
      const offset = args.offset || 0;
      const includeDetails = args.includeDetails !== false;
      
      // Find the page
      const objects = this.database.searchObjects(args.objectName, 'Page');
      const targetPage = objects.find(obj => obj.Name === args.objectName);
      
      if (!targetPage) {
        throw new Error(`Page not found: ${args.objectName}`);
      }

      // Get all controls for the page
      let allControls = this.database.getPageControls(targetPage.Name);
      
      // Filter by pattern if provided
      if (args.controlPattern) {
        const pattern = args.controlPattern.toLowerCase();
        const isWildcard = pattern.includes('*');
        
        if (isWildcard) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          allControls = allControls.filter(control => 
            control.Name && regex.test(control.Name.toLowerCase())
          );
        } else {
          allControls = allControls.filter(control => 
            control.Name && control.Name.toLowerCase().includes(pattern)
          );
        }
      }

      // Apply pagination
      const totalFound = allControls.length;
      const paginatedControls = allControls.slice(offset, offset + limit);

      // Optionally strip details to save tokens
      const controls = paginatedControls.map(control => {
        if (!includeDetails) {
          // Return minimal info
          return {
            Name: control.Name,
            Type: control.Type || control.ControlType
          };
        }
        return control;
      });

      const executionTime = Date.now() - startTime;

      return {
        objectName: args.objectName,
        objectType: 'Page',
        controls,
        totalFound,
        returned: controls.length,
        offset,
        limit,
        hasMore: offset + limit < totalFound,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search controls failed: ${error}`);
    }
  }

  /**
   * Search data items within reports, queries, or xmlports
   */
  async searchDataItems(args: SearchDataItemsArgs): Promise<SearchDataItemsResult> {
    const startTime = Date.now();
    
    try {
      const limit = args.limit || 20;
      const offset = args.offset || 0;
      const includeDetails = args.includeDetails !== false;
      
      // Find the object (Report, Query, or XmlPort)
      const objects = this.database.searchObjects(args.objectName);
      const targetObject = objects.find(obj => 
        obj.Name === args.objectName && 
        ['Report', 'Query', 'XmlPort'].includes(obj.Type)
      );
      
      if (!targetObject) {
        throw new Error(`Report/Query/XmlPort not found: ${args.objectName}`);
      }

      // Get all data items for the object
      let allDataItems = this.database.getDataItems(targetObject.Name);
      
      // Filter by pattern if provided
      if (args.dataItemPattern) {
        const pattern = args.dataItemPattern.toLowerCase();
        const isWildcard = pattern.includes('*');
        
        if (isWildcard) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          allDataItems = allDataItems.filter(item => 
            item.Name && regex.test(item.Name.toLowerCase())
          );
        } else {
          allDataItems = allDataItems.filter(item => 
            item.Name && item.Name.toLowerCase().includes(pattern)
          );
        }
      }

      // Apply pagination
      const totalFound = allDataItems.length;
      const paginatedItems = allDataItems.slice(offset, offset + limit);

      // Optionally strip details to save tokens
      const dataItems = paginatedItems.map(item => {
        if (!includeDetails) {
          // Return minimal info
          return {
            Name: item.Name,
            DataItemTable: item.DataItemTable || item.SourceTable,
            NodeType: item.NodeType
          };
        }
        return item;
      });

      const executionTime = Date.now() - startTime;

      return {
        objectName: args.objectName,
        objectType: targetObject.Type,
        dataItems,
        totalFound,
        returned: dataItems.length,
        offset,
        limit,
        hasMore: offset + limit < totalFound,
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Search data items failed: ${error}`);
    }
  }

  /**
   * Get intelligent summary of an object with smart procedure categorization
   */
  async getObjectSummary(objectName: string, objectType?: string): Promise<{
    object: any;
    summary: {
      name: string;
      type: string;
      totalProcedures: number;
      procedureCategories: {
        [category: string]: {
          count: number;
          examples: string[];
        };
      };
      keyProcedures: string[];
      description: string;
    };
    executionTimeMs: number;
  }> {
    const startTime = Date.now();

    try {
      // Find the object
      const objects = this.database.searchObjects(objectName, objectType);
      const targetObject = objects.find(obj => obj.Name === objectName);
      
      if (!targetObject) {
        throw new Error(`Object not found: ${objectName}`);
      }

      // Get procedures
      const allProcedures = this.database.getObjectProcedures(targetObject.Name);
      
      // Categorize procedures intelligently
      const categories: { [key: string]: { count: number; examples: string[] } } = {};
      const keyProcedures: string[] = [];

      // Define procedure categories based on naming patterns
      const categoryPatterns = {
        'Main Entry Points': /^(Run|Execute|Process|Main|Start)/i,
        'Validation & Checks': /^(Check|Validate|Test|Verify|Ensure)/i,
        'Posting Operations': /^(Post|Create|Insert|Update|Delete|Modify)/i,
        'Data Processing': /^(Fill|Refresh|Reset|Copy|Transfer|Calculate|Build)/i,
        'Event Handlers': /^(On[A-Z]|Before|After)/i,
        'Getters & Utilities': /^(Get|Find|Lookup|Set|Init)/i,
        'Error Handling': /^(Error|Exception|Handle|Raise)/i
      };

      // Categorize each procedure
      for (const proc of allProcedures) {
        let categorized = false;
        
        for (const [categoryName, pattern] of Object.entries(categoryPatterns)) {
          if (pattern.test(proc.Name)) {
            if (!categories[categoryName]) {
              categories[categoryName] = { count: 0, examples: [] };
            }
            categories[categoryName].count++;
            
            // Add to examples (max 5 per category)
            if (categories[categoryName].examples.length < 5) {
              categories[categoryName].examples.push(proc.Name);
            }
            categorized = true;
            break;
          }
        }

        // If not categorized, put in "Other"
        if (!categorized) {
          if (!categories['Other Functions']) {
            categories['Other Functions'] = { count: 0, examples: [] };
          }
          categories['Other Functions'].count++;
          if (categories['Other Functions'].examples.length < 3) {
            categories['Other Functions'].examples.push(proc.Name);
          }
        }

        // Identify key procedures (likely entry points)
        if (/^(Run|Execute|Process|Main|Check.*Document|Post.*Line)$/i.test(proc.Name)) {
          keyProcedures.push(proc.Name);
        }
      }

      // Generate intelligent description
      let description = `The ${targetObject.Name} ${targetObject.Type.toLowerCase()}`;
      if (targetObject.Type === 'Codeunit') {
        description += ` has ${allProcedures.length} procedures covering`;
        const topCategories = Object.entries(categories)
          .sort(([,a], [,b]) => b.count - a.count)
          .slice(0, 3)
          .map(([name]) => name.toLowerCase());
        description += ` ${topCategories.join(', ')}`;
        
        if (targetObject.Name.includes('Post')) {
          description += ', focused on posting operations';
        }
      }

      const executionTime = Date.now() - startTime;

      return {
        object: {
          Name: targetObject.Name,
          Type: targetObject.Type,
          Id: targetObject.Id,
          PackageName: targetObject.PackageName
        },
        summary: {
          name: targetObject.Name,
          type: targetObject.Type,
          totalProcedures: allProcedures.length,
          procedureCategories: categories,
          keyProcedures: keyProcedures.slice(0, 10), // Max 10 key procedures
          description
        },
        executionTimeMs: executionTime
      };
    } catch (error) {
      throw new Error(`Get object summary failed: ${error}`);
    }
  }
}