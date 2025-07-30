import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { ALParser } from './al-parser.js';
import { GitManager } from './git-manager.js';
import {
  ALObject,
  ObjectReference,
  ObjectRelationship,
  DependencyGraph,
  ALTable,
  ALCodeunit,
  ALPage
} from './types/al-objects.js';
import {
  ALObjectType,
  RelationshipType,
  ExtensionDependency
} from './types/al-types.js';

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

  constructor(logger: Logger) {
    this.logger = logger;
    this.parser = new ALParser(logger);
    this.gitManager = new GitManager(logger);
  }

  async getObject(
    objectType: ALObjectType,
    identifier: string | number,
    branch?: string,
    options: {
      include_dependencies?: boolean;
      include_events?: boolean;
      include_permissions?: boolean;
    } = {}
  ): Promise<any> {
    this.logger.info(`Getting object: ${objectType} ${identifier}`, { branch, options });

    const objects = await this.getObjectsFromBranch(branch);
    const targetObject = objects.find(obj => 
      obj.type === objectType && 
      (obj.name === identifier || obj.id === identifier)
    );

    if (!targetObject) {
      throw new Error(`Object not found: ${objectType} ${identifier}`);
    }

    const result: any = {
      ...targetObject,
      metadata: {
        analyzedAt: new Date().toISOString(),
        branch: branch || 'current'
      }
    };

    if (options.include_dependencies) {
      result.dependencies = await this.getObjectDependencies(targetObject);
    }

    if (options.include_events) {
      result.events = await this.getObjectEvents(targetObject);
    }

    if (options.include_permissions) {
      result.permissions = await this.getObjectPermissions(targetObject);
    }

    return result;
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
    const repoPath = '/app/repo-cache'; // This should come from GitManager
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
    return objects.find(obj => 
      obj.name === name || 
      obj.name.replace(/["]/g, '') === name ||
      (obj.id && obj.id.toString() === name)
    );
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
      relationships.push({
        source: objRef,
        target: obj.extends,
        type: 'extends'
      });
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
        permissions: Object.entries(tablePerms).map(([key, value]) => `${key}:${value}`)
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