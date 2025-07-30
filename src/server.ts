#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { GitManager } from './git-manager.js';
import { ALParser } from './al-parser.js';
import { ALAnalyzer } from './al-analyzer.js';
import { SearchIndexer } from './search-indexer.js';
import { RepositoryDetector } from './repository-detector.js';
import { createLogger, Logger } from 'winston';
import { RepositoryConfig, WorkspaceConfig, ALObjectType, RelationshipType, BranchType } from './types/al-types.js';
import { MCPTool } from './types/mcp-types.js';

class ALMCPServer {
  private server: Server;
  private logger: Logger;
  private gitManager: GitManager;
  private alParser: ALParser;
  private alAnalyzer: ALAnalyzer;
  private searchIndexer: SearchIndexer;
  private repositoryDetector: RepositoryDetector;
  private isInitialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'al-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: this.getLogFormat(),
      transports: [
        new (require('winston')).transports.Console()
      ]
    });

    this.gitManager = new GitManager(this.logger);
    this.alParser = new ALParser(this.logger);
    this.alAnalyzer = new ALAnalyzer(this.logger);
    this.searchIndexer = new SearchIndexer(this.logger);
    this.repositoryDetector = new RepositoryDetector(this.logger);

    this.setupHandlers();
  }

  private getLogFormat() {
    const { combine, timestamp, printf, colorize } = require('winston').format;
    return combine(
      colorize(),
      timestamp(),
      printf(({ timestamp, level, message, ...rest }: any) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`;
      })
    );
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAllTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        this.logger.info(`Calling tool: ${name}`, { args });

        await this.ensureInitialized();

        const result = await this.handleToolCall(name, args || {});
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error(`Tool call failed: ${request.params.name}`, { error });
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing AL MCP Server...');
      
      const repoConfig = this.getRepositoryConfig();
      await this.gitManager.initialize(repoConfig);
      
      if (repoConfig.type === 'local-development') {
        const workspaceConfig = this.getWorkspaceConfig();
        await this.repositoryDetector.detectWorkspace(workspaceConfig);
      }

      await this.searchIndexer.initialize();
      this.isInitialized = true;
      
      this.logger.info('AL MCP Server initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AL MCP Server', { error });
      throw new McpError(ErrorCode.InternalError, `Initialization failed: ${error}`);
    }
  }

  private getRepositoryConfig(): RepositoryConfig {
    return {
      type: (process.env.REPO_TYPE as any) || 'bc-history-sandbox',
      url: process.env.REPO_URL || 'https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git',
      path: process.env.REPO_PATH,
      defaultBranches: (process.env.DEFAULT_BRANCHES || 'w1-26,w1-24').split(','),
      maxBranches: parseInt(process.env.MAX_BRANCHES || '10'),
      autoCleanup: process.env.AUTO_CLEANUP === 'true',
      cleanupInterval: process.env.CLEANUP_INTERVAL || '24h',
      authTokenFile: process.env.AUTH_TOKEN_FILE,
    };
  }

  private getWorkspaceConfig(): WorkspaceConfig {
    return {
      workspacePath: process.env.WORKSPACE_PATH,
      referencePath: process.env.REFERENCE_PATH,
      watchFiles: process.env.WATCH_FILES === 'true',
      scanDepth: parseInt(process.env.SCAN_DEPTH || '2'),
    };
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    switch (name) {
      // Repository Management
      case 'al_add_branch':
        return await this.addBranch(args);
      case 'al_remove_branch':
        return await this.removeBranch(args);
      case 'al_set_repository':
        return await this.setRepository(args);
      case 'al_list_branches':
        return await this.listBranches(args);
      case 'al_repo_status':
        return await this.getRepositoryStatus(args);

      // AL Object Discovery
      case 'al_search_objects':
        return await this.searchObjects(args);
      case 'al_get_object':
        return await this.getObject(args);
      case 'al_find_relationships':
        return await this.findRelationships(args);

      // Workspace Analysis
      case 'al_workspace_overview':
        return await this.getWorkspaceOverview(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  // Tool implementations
  private async addBranch(args: { branch: string; shallow?: boolean; auto_detect_type?: boolean }): Promise<any> {
    const { branch, shallow = true, auto_detect_type = true } = args;
    
    if (!branch) {
      throw new McpError(ErrorCode.InvalidParams, 'Branch name is required');
    }

    const result = await this.gitManager.addBranch(branch, { shallow, autoDetectType: auto_detect_type });
    await this.searchIndexer.indexBranch(branch);
    
    return {
      success: true,
      branch: result.name,
      type: result.type,
      objectCount: result.objectCount,
      message: `Branch '${branch}' added successfully`
    };
  }

  private async removeBranch(args: { branch: string; cleanup_local?: boolean }): Promise<any> {
    const { branch, cleanup_local = true } = args;
    
    if (!branch) {
      throw new McpError(ErrorCode.InvalidParams, 'Branch name is required');
    }

    await this.gitManager.removeBranch(branch, { cleanupLocal: cleanup_local });
    await this.searchIndexer.removeBranchIndex(branch);
    
    return {
      success: true,
      message: `Branch '${branch}' removed successfully`
    };
  }

  private async setRepository(args: any): Promise<any> {
    const repoConfig: RepositoryConfig = {
      type: args.repo_type || 'microsoft-bc',
      url: args.repo_url,
      path: args.repo_path,
      defaultBranches: args.default_branches || ['w1-26', 'w1-24'],
    };

    await this.gitManager.setRepository(repoConfig);
    await this.searchIndexer.rebuild();
    this.isInitialized = true;
    
    return {
      success: true,
      repository: repoConfig,
      message: 'Repository configuration updated successfully'
    };
  }

  private async listBranches(args: { filter?: string; include_remote?: boolean; branch_type?: BranchType } = {}): Promise<any> {
    const branches = await this.gitManager.listBranches(args);
    return {
      branches,
      totalCount: branches.length
    };
  }

  private async getRepositoryStatus(args: { detailed?: boolean; include_performance?: boolean; health_check?: boolean } = {}): Promise<any> {
    const status = await this.gitManager.getRepositoryStatus();
    
    if (args.include_performance) {
      const perfMetrics = await this.searchIndexer.getPerformanceMetrics();
      (status as any).performance = perfMetrics;
    }

    if (args.health_check) {
      const health = await this.performHealthCheck();
      (status as any).health = health;
    }

    return status;
  }

  private async searchObjects(args: {
    query: string;
    object_type?: ALObjectType;
    branches?: string[];
    namespace?: string;
    id_range?: string;
    include_obsolete?: boolean;
  }): Promise<any> {
    const { query, ...filters } = args;
    
    if (!query) {
      throw new McpError(ErrorCode.InvalidParams, 'Search query is required');
    }

    const results = await this.searchIndexer.search(query, filters);
    return results;
  }

  private async getObject(args: {
    object_type: ALObjectType;
    object_name?: string;
    object_id?: number;
    branch?: string;
    include_dependencies?: boolean;
    include_events?: boolean;
    include_permissions?: boolean;
  }): Promise<any> {
    const { object_type, object_name, object_id, branch, ...options } = args;
    
    if (!object_type) {
      throw new McpError(ErrorCode.InvalidParams, 'Object type is required');
    }

    if (!object_name && !object_id) {
      throw new McpError(ErrorCode.InvalidParams, 'Either object_name or object_id is required');
    }

    const objectInfo = await this.alAnalyzer.getObject(object_type, object_name || object_id, branch, options);
    return objectInfo;
  }

  private async findRelationships(args: {
    source_object: string;
    relationship_type?: RelationshipType;
    max_depth?: number;
    branches?: string[];
  }): Promise<any> {
    const { source_object, relationship_type = 'all', max_depth = 2, branches } = args;
    
    if (!source_object) {
      throw new McpError(ErrorCode.InvalidParams, 'Source object is required');
    }

    const relationships = await this.alAnalyzer.findRelationships(source_object, {
      relationshipType: relationship_type,
      maxDepth: max_depth,
      branches
    });
    
    return relationships;
  }


  private async getWorkspaceOverview(args: {
    workspace_path?: string;
    include_dependencies?: boolean;
    scan_depth?: number;
  } = {}): Promise<any> {
    const workspaceConfig = {
      ...this.getWorkspaceConfig(),
      ...args
    };

    const overview = await this.repositoryDetector.getWorkspaceOverview(workspaceConfig);
    return overview;
  }

  private async performHealthCheck(): Promise<any> {
    return {
      git: await this.gitManager.healthCheck(),
      indexer: await this.searchIndexer.healthCheck(),
      parser: await this.alParser.healthCheck(),
      timestamp: new Date().toISOString()
    };
  }

  private getAllTools(): MCPTool[] {
    return [
      // Repository Management Tools
      {
        name: 'al_add_branch',
        description: 'Add branch to browse BC code in specific version or fork',
        inputSchema: {
          type: 'object',
          properties: {
            branch: {
              type: 'string',
              description: 'Branch name (e.g., w1-24, w1-25, main, develop)'
            },
            shallow: {
              type: 'boolean',
              default: true,
              description: 'Use shallow clone (depth 1) for space efficiency'
            },
            auto_detect_type: {
              type: 'boolean',
              default: true,
              description: 'Auto-detect if this is a BC version branch or feature branch'
            }
          },
          required: ['branch']
        }
      },
      {
        name: 'al_remove_branch',
        description: 'Remove branch from local BC code cache',
        inputSchema: {
          type: 'object',
          properties: {
            branch: {
              type: 'string',
              description: 'Branch name to remove'
            },
            cleanup_local: {
              type: 'boolean',
              default: true,
              description: 'Also remove local branch references and cached data'
            }
          },
          required: ['branch']
        }
      },
      {
        name: 'al_set_repository',
        description: 'Switch to different BC code repository for browsing',
        inputSchema: {
          type: 'object',
          properties: {
            repo_url: {
              type: 'string',
              description: 'Git repository URL (GitHub, Azure DevOps, etc.)'
            },
            repo_path: {
              type: 'string',
              description: 'Local repository path (alternative to repo_url)'
            },
            repo_type: {
              type: 'string',
              enum: ['bc-history-sandbox', 'bc-fork', 'al-extension', 'local-development'],
              description: 'Repository type for optimized handling'
            },
            default_branches: {
              type: 'array',
              items: { type: 'string' },
              description: 'Branches to initially track'
            }
          }
        }
      },
      {
        name: 'al_list_branches',
        description: 'List available BC code branches for browsing',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Filter pattern (e.g., "w1-*", "feature/*", "main")'
            },
            include_remote: {
              type: 'boolean',
              default: false,
              description: 'Include remote branches not yet tracked locally'
            },
            branch_type: {
              type: 'string',
              enum: ['bc_version', 'feature', 'release', 'all'],
              default: 'all',
              description: 'Filter by branch type'
            }
          }
        }
      },
      {
        name: 'al_repo_status',
        description: 'Get BC code repository status and browsing capabilities',
        inputSchema: {
          type: 'object',
          properties: {
            detailed: {
              type: 'boolean',
              default: false,
              description: 'Include detailed branch and object statistics'
            },
            include_performance: {
              type: 'boolean',
              default: false,
              description: 'Include indexing and caching performance metrics'
            },
            health_check: {
              type: 'boolean',
              default: true,
              description: 'Perform repository health validation'
            }
          }
        }
      },

      // BC Code Browsing Tools
      {
        name: 'al_search_objects',
        description: 'Browse and search BC code objects (tables, pages, codeunits, reports, enums, interfaces)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (object name, pattern, or keyword)'
            },
            object_type: {
              type: 'string',
              enum: ['table', 'page', 'codeunit', 'report', 'query', 'enum', 'interface', 'permissionset', 'xmlport', 'controladdin'],
              description: 'Filter by AL object type'
            },
            branches: {
              type: 'array',
              items: { type: 'string' },
              description: 'Branches to search in (default: all available)'
            },
            namespace: {
              type: 'string',
              description: 'Filter by namespace (e.g., "Microsoft.*")'
            },
            id_range: {
              type: 'string',
              description: 'Filter by object ID range (e.g., "50000-59999", "AppSource", "PTE")'
            },
            include_obsolete: {
              type: 'boolean',
              default: false,
              description: 'Include objects marked as obsolete'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'al_get_object',
        description: 'Get detailed BC code object information for understanding dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            object_type: { type: 'string' },
            object_name: { type: 'string' },
            object_id: { type: 'number', description: 'Object ID (alternative to name)' },
            branch: { type: 'string' },
            include_dependencies: {
              type: 'boolean',
              default: false,
              description: 'Include object dependencies and references'
            },
            include_events: {
              type: 'boolean',
              default: false,
              description: 'Include published events and event subscribers'
            },
            include_permissions: {
              type: 'boolean',
              default: false,
              description: 'Include required permissions for this object'
            }
          },
          required: ['object_type']
        }
      },
      {
        name: 'al_find_relationships',
        description: 'Discover BC code object relationships and dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            source_object: { type: 'string', description: 'Source object to analyze' },
            relationship_type: {
              type: 'string',
              enum: ['extends', 'implements', 'uses', 'used_by', 'events', 'all'],
              default: 'all',
              description: 'Type of relationships to find'
            },
            max_depth: {
              type: 'number',
              default: 2,
              description: 'Maximum relationship depth to traverse'
            },
            branches: {
              type: 'array',
              items: { type: 'string' },
              description: 'Branches to search in'
            }
          },
          required: ['source_object']
        }
      },

      {
        name: 'al_workspace_overview',
        description: 'Get workspace overview to understand project dependencies and structure',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Workspace path (if different from configured)'
            },
            include_dependencies: {
              type: 'boolean',
              default: true,
              description: 'Include extension dependencies in overview'
            },
            scan_depth: {
              type: 'number',
              default: 2,
              description: 'Directory scan depth for AL projects'
            }
          }
        }
      }
    ];
  }

  public async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('AL MCP Server running on stdio');
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ALMCPServer();
  server.run().catch((error) => {
    console.error('Failed to start AL MCP Server:', error);
    process.exit(1);
  });
}

export { ALMCPServer };