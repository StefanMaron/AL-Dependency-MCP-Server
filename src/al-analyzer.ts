import { Logger } from 'winston';
import path from 'path';
import { ALParser } from './al-parser';
import { GitManager } from './git-manager';
import {
  ALObject,
  ObjectReference,
  ObjectRelationship,
  DependencyGraph,
  ALTable,
  ALCodeunit,
  ALPage,
  PermissionInfo
} from './types/al-objects';
import {
  ALObjectType,
  RelationshipType,
  ExtensionDependency
} from './types/al-types';

export interface RelationshipOptions {
  relationshipType: RelationshipType;
  maxDepth: number;
  branches?: string[];
}

export class ALAnalyzer {
  private logger: Logger;
  private parser: ALParser;
  private gitManager: GitManager;
  private objectCache: Map<string, ALObject[]> = new Map();
  private dependencyGraph: Map<string, DependencyGraph> = new Map();

  constructor(logger: Logger, gitManager?: GitManager) {
    this.logger = logger;
    this.parser = new ALParser(logger);
    this.gitManager = gitManager || new GitManager(logger);
  }

  async getObject(
    objectType: ALObjectType,
    identifier: string | number,
    branch?: string,
    options: {
      include_dependencies?: boolean;
      include_events?: boolean;
      include_permissions?: boolean;
      include_summary_only?: boolean;
      include_procedures?: boolean;
      include_variables?: boolean;
      include_triggers?: boolean;
      max_procedures?: number;
      max_variables?: number;
      include_source_code?: boolean;
    } = {}
  ): Promise<any> {
    this.logger.info(`Getting object: ${objectType} ${identifier}`, { 
      branch, 
      options, 
      identifierType: typeof identifier 
    });

    const objects = await this.getObjectsFromBranch(branch);
    
    this.logger.debug(`Found ${objects.length} objects in branch`, {
      branch: branch || 'current',
      objectTypes: [...new Set(objects.map(o => o.type))],
      sampleObjects: objects.slice(0, 5).map(o => ({ type: o.type, name: o.name, id: o.id }))
    });

    const targetObject = objects.find(obj => {
      if (obj.type !== objectType) return false;
      
      // Name match (string comparison)
      if (typeof identifier === 'string' && obj.name === identifier) return true;
      
      // ID match (obj.id is always number type according to ALObject interface)
      if (obj.id !== undefined) {
        if (typeof identifier === 'number') {
          return obj.id === identifier;
        }
        if (typeof identifier === 'string') {
          const numericId = parseInt(identifier);
          return !isNaN(numericId) && obj.id === numericId;
        }
      }
      
      return false;
    });

    if (!targetObject) {
      // Provide more debugging information
      const matchingType = objects.filter(obj => obj.type === objectType);
      this.logger.error(`Object not found`, {
        objectType,
        identifier,
        identifierType: typeof identifier,
        totalObjects: objects.length,
        matchingTypeCount: matchingType.length,
        availableIds: matchingType.map(o => o.id).filter(id => id !== undefined).slice(0, 10),
        availableNames: matchingType.map(o => o.name).slice(0, 10)
      });
      
      throw new Error(`Object not found: ${objectType} ${identifier}. Found ${matchingType.length} objects of type ${objectType}`);
    }

    let result: any;

    // If summary only requested, return minimal info
    if (options.include_summary_only) {
      result = {
        type: targetObject.type,
        id: targetObject.id,
        name: targetObject.name,
        namespace: targetObject.namespace,
        caption: targetObject.caption,
        filePath: targetObject.filePath,
        branch: targetObject.branch,
        lineNumber: targetObject.lineNumber,
        isObsolete: targetObject.isObsolete,
        obsoleteReason: targetObject.obsoleteReason,
        access: targetObject.access,
        extensible: targetObject.extensible,
        metadata: {
          analyzedAt: new Date().toISOString(),
          branch: branch || 'current',
          responseType: 'summary'
        }
      };
    } else {
      // Full object, but apply filtering
      result = { ...targetObject };
      
      // Apply content filtering for large objects
      if (targetObject.type === 'codeunit' && 'procedures' in targetObject) {
        const codeunit = targetObject as any;
        if (options.include_procedures !== false && codeunit.procedures) {
          if (options.max_procedures && codeunit.procedures.length > options.max_procedures) {
            result.procedures = codeunit.procedures.slice(0, options.max_procedures);
            result.proceduresTruncated = true;
            result.totalProcedures = codeunit.procedures.length;
          }
        } else if (options.include_procedures === false) {
          delete result.procedures;
        }

        if (options.include_variables === false) {
          delete result.variables;
        } else if (options.max_variables && codeunit.variables && codeunit.variables.length > options.max_variables) {
          result.variables = codeunit.variables.slice(0, options.max_variables);
          result.variablesTruncated = true;
          result.totalVariables = codeunit.variables.length;
        }

        if (options.include_triggers === false) {
          delete result.triggers;
        }
      }

      // Apply similar filtering for other object types
      if ((targetObject.type === 'table' || targetObject.type === 'page') && options.include_triggers === false) {
        delete result.triggers;
      }

      result.metadata = {
        analyzedAt: new Date().toISOString(),
        branch: branch || 'current',
        responseType: 'filtered'
      };
    }

    if (options.include_dependencies) {
      result.dependencies = await this.getObjectDependencies(targetObject);
    }

    if (options.include_events) {
      result.events = await this.getObjectEvents(targetObject);
    }

    if (options.include_permissions) {
      result.permissions = await this.getObjectPermissions(targetObject);
    }

    // Include source code if requested
    if (options.include_source_code) {
      try {
        result.sourceCode = await this.gitManager.getFileContent(targetObject.filePath, targetObject.branch);
        this.logger.debug(`Retrieved source code for ${targetObject.type} ${targetObject.name}`, {
          sourceCodeLength: result.sourceCode?.length || 0
        });
      } catch (error) {
        this.logger.warn(`Failed to retrieve source code for ${targetObject.type} ${targetObject.name}`, { error });
        result.sourceCodeError = 'Failed to retrieve source code';
      }
    }

    // Add size estimation to help users understand response size
    const estimatedTokens = this.estimateResponseTokens(result);
    result.metadata.estimatedTokens = estimatedTokens;
    
    // If response might be too large, add guidance
    if (estimatedTokens > 20000) {
      result.metadata.sizeWarning = {
        message: 'This response may be large. Consider using filtering options to reduce size.',
        suggestions: [
          'Use include_summary_only: true for basic info only',
          'Use include_procedures: false to exclude procedures',
          'Use max_procedures: 10 to limit procedure count',
          'Use include_variables: false to exclude variables',
          'Use include_triggers: false to exclude triggers',
          'Use include_source_code: false to exclude source code (usually the largest part)'
        ]
      };
    }

    return result;
  }

  private estimateResponseTokens(obj: any): number {
    // Rough estimation: 1 token per 4 characters on average
    const jsonString = JSON.stringify(obj);
    return Math.ceil(jsonString.length / 4);
  }

  async findRelationships(
    sourceObject: string,
    options: RelationshipOptions
  ): Promise<DependencyGraph> {
    this.logger.info(`Finding relationships for: ${sourceObject}`, { options });

    const cacheKey = `${sourceObject}-${JSON.stringify(options)}`;
    if (this.dependencyGraph.has(cacheKey)) {
      return this.dependencyGraph.get(cacheKey)!;
    }

    const nodes: ObjectReference[] = [];
    const edges: ObjectRelationship[] = [];
    const visited = new Set<string>();

    // Find the source object
    const objects = await this.getObjectsFromBranches(options.branches);
    const sourceObj = this.findObjectByName(objects, sourceObject);
    
    if (!sourceObj) {
      throw new Error(`Source object not found: ${sourceObject}`);
    }

    await this.traverseRelationships(
      sourceObj,
      objects,
      options,
      0,
      nodes,
      edges,
      visited
    );

    const graph: DependencyGraph = {
      nodes,
      edges,
      metadata: {
        generatedAt: new Date(),
        branch: options.branches?.[0] || 'current',
        totalObjects: nodes.length,
        totalRelationships: edges.length
      }
    };

    this.dependencyGraph.set(cacheKey, graph);
    return graph;
  }


  private async getObjectsFromBranch(branch?: string): Promise<ALObject[]> {
    const branchKey = branch || 'current';
    
    if (this.objectCache.has(branchKey)) {
      return this.objectCache.get(branchKey)!;
    }

    const currentBranch = await this.gitManager.getCurrentBranch();
    if (branch && branch !== currentBranch) {
      await this.gitManager.checkoutBranch(branch);
    }

    // Get repository root path and parse AL files
    const repoPath = process.env.REPO_CACHE_PATH || path.join(process.cwd(), '.cache', 'repo-cache');
    const parseResult = await this.parser.parseDirectory(
      repoPath,
      branchKey,
      { includeObsolete: false, includeDetails: true, validateSyntax: false }
    );

    this.objectCache.set(branchKey, parseResult.objects);
    return parseResult.objects;
  }

  private async getObjectsFromBranches(branches?: string[]): Promise<ALObject[]> {
    if (!branches || branches.length === 0) {
      return await this.getObjectsFromBranch();
    }

    const allObjects: ALObject[] = [];
    for (const branch of branches) {
      const objects = await this.getObjectsFromBranch(branch);
      allObjects.push(...objects);
    }

    return allObjects;
  }

  private findObjectByName(objects: ALObject[], name: string): ALObject | undefined {
    return objects.find(obj => {
      // Exact name match
      if (obj.name === name) return true;
      
      // Name without quotes
      if (obj.name.replace(/["]/g, '') === name) return true;
      
      // ID match (obj.id is always number type)
      if (obj.id !== undefined) {
        if (obj.id.toString() === name) return true;
        const numericName = parseInt(name);
        if (!isNaN(numericName) && obj.id === numericName) return true;
      }
      
      return false;
    });
  }

  private async traverseRelationships(
    currentObj: ALObject,
    allObjects: ALObject[],
    options: RelationshipOptions,
    depth: number,
    nodes: ObjectReference[],
    edges: ObjectRelationship[],
    visited: Set<string>
  ): Promise<void> {
    if (depth >= options.maxDepth) return;

    const objKey = `${currentObj.type}-${currentObj.name}`;
    if (visited.has(objKey)) return;
    
    visited.add(objKey);
    
    // Add current object as node
    const objRef: ObjectReference = {
      type: currentObj.type,
      name: currentObj.name,
      id: currentObj.id,
      namespace: currentObj.namespace,
      filePath: currentObj.filePath,
      branch: currentObj.branch
    };
    
    if (!nodes.some(n => n.name === objRef.name && n.type === objRef.type)) {
      nodes.push(objRef);
    }

    // Find relationships
    const relationships = await this.findObjectRelationships(currentObj, allObjects, options.relationshipType);
    
    for (const rel of relationships) {
      edges.push(rel);
      
      // Recursively traverse related objects
      const relatedObj = this.findObjectByName(allObjects, rel.target.name);
      if (relatedObj) {
        await this.traverseRelationships(relatedObj, allObjects, options, depth + 1, nodes, edges, visited);
      }
    }
  }

  private async findObjectRelationships(
    obj: ALObject,
    allObjects: ALObject[],
    relationshipType: RelationshipType
  ): Promise<ObjectRelationship[]> {
    const relationships: ObjectRelationship[] = [];
    const objRef: ObjectReference = {
      type: obj.type,
      name: obj.name,
      id: obj.id,
      filePath: obj.filePath,
      branch: obj.branch
    };

    // Find extends relationships
    if ((relationshipType === 'extends' || relationshipType === 'all') && 'extends' in obj && obj.extends) {
      // Type guard to ensure obj.extends is properly typed
      const extendsRef = obj.extends as ObjectReference;
      if (extendsRef && extendsRef.type && extendsRef.name) {
        relationships.push({
          source: objRef,
          target: extendsRef,
          type: 'extends'
        });
      }
    }

    // Find implements relationships
    if ((relationshipType === 'implements' || relationshipType === 'all') && obj.type === 'codeunit') {
      // Look for interface implementations in the codeunit
      // This would require parsing the implements clause
    }

    // Find uses relationships
    if (relationshipType === 'uses' || relationshipType === 'all') {
      const dependencies = this.parser.extractDependencies(obj);
      for (const dep of dependencies) {
        relationships.push({
          source: objRef,
          target: dep,
          type: 'uses'
        });
      }
    }

    // Find used_by relationships
    if (relationshipType === 'used_by' || relationshipType === 'all') {
      const dependents = allObjects.filter(other => {
        const deps = this.parser.extractDependencies(other);
        return deps.some(dep => dep.name === obj.name && dep.type === obj.type);
      });

      for (const dependent of dependents) {
        relationships.push({
          source: {
            type: dependent.type,
            name: dependent.name,
            id: dependent.id,
            filePath: dependent.filePath,
            branch: dependent.branch
          },
          target: objRef,
          type: 'uses'
        });
      }
    }

    return relationships;
  }

  private async getObjectDependencies(obj: ALObject): Promise<ObjectReference[]> {
    return this.parser.extractDependencies(obj);
  }

  private async getObjectEvents(obj: ALObject): Promise<any[]> {
    const events: any[] = [];
    
    if (obj.type === 'codeunit' && 'events' in obj) {
      events.push(...(obj as ALCodeunit).events);
    }

    return events;
  }

  private async getObjectPermissions(obj: ALObject): Promise<PermissionInfo[]> {
    const permissions: PermissionInfo[] = [];
    
    if (obj.type === 'table' && 'permissions' in obj) {
      const tablePerms = (obj as ALTable).permissions;
      permissions.push({
        objectType: 'table',
        objectId: obj.id!,
        permissions: {
          read: tablePerms.read,
          insert: tablePerms.insert,
          modify: tablePerms.modify,
          delete: tablePerms.delete
        }
      });
    }

    return permissions;
  }


  async healthCheck(): Promise<any> {
    try {
      const cacheStatus = {
        cachedBranches: this.objectCache.size,
        dependencyGraphs: this.dependencyGraph.size
      };

      return {
        status: 'healthy',
        cache: cacheStatus,
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
}