#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ALCliWrapper } from './cli/al-cli.js';
import { ALInstaller } from './cli/al-installer.js';
import { OptimizedSymbolDatabase } from './core/symbol-database.js';
import { ALPackageManager } from './core/package-manager.js';
import { ALMCPTools } from './tools/mcp-tools.js';
import { ParseProgress } from './parser/streaming-parser.js';

export class ALMCPServer {
  private server: Server;
  private alCli: ALCliWrapper;
  private database: OptimizedSymbolDatabase;
  private packageManager: ALPackageManager;
  private tools: ALMCPTools;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

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

    // Initialize components (AL CLI will be set up during start)
    this.alCli = new ALCliWrapper();
    this.database = new OptimizedSymbolDatabase();
    this.packageManager = new ALPackageManager(
      this.alCli,
      this.reportProgress.bind(this),
      this.database
    );
    this.tools = new ALMCPTools(this.database, this.packageManager);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'al_search_objects',
            description: 'Search AL objects in YOUR WORKSPACE (.app packages). Analyzes compiled AL code structure. Use summaryMode:true & limit for token efficiency. For complex objects prefer al_get_object_summary. Supports domain filtering.',
            inputSchema: {
              type: 'object',
              properties: {
                pattern: {
                  type: 'string',
                  description: 'Search pattern (wildcards supported)',
                },
                objectType: {
                  type: 'string',
                  description: 'Filter by type',
                  enum: ['Table', 'TableExtension', 'Page', 'PageExtension', 'Codeunit', 'Report', 'ReportExtension', 'Enum', 'EnumExtensionType', 'Interface', 'PermissionSet', 'PermissionSetExtension', 'XmlPort', 'Query'],
                },
                packageName: {
                  type: 'string',
                  description: 'Filter by package',
                },
                domain: {
                  type: 'string',
                  description: 'Business domain filter',
                  enum: ['Sales', 'Purchasing', 'Finance', 'Inventory', 'Manufacturing', 'Service'],
                },
                includeFields: {
                  type: 'boolean',
                  description: 'Include table fields (increases tokens)',
                  default: false,
                },
                includeProcedures: {
                  type: 'boolean',
                  description: 'Include procedures (increases tokens)',
                  default: false,
                },
                limit: {
                  type: 'number',
                  description: 'Max results (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Pagination offset (default: 0)',
                  default: 0,
                },
                summaryMode: {
                  type: 'boolean',
                  description: 'Summary view (default: true)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'al_get_object_definition',
            description: 'Get AL object definition from YOUR WORKSPACE. Retrieves compiled code structure by ID or name. Use summaryMode:true for token efficiency. Use limits for large objects.',
            inputSchema: {
              type: 'object',
              properties: {
                objectId: {
                  type: 'number',
                  description: 'Object ID',
                },
                objectName: {
                  type: 'string',
                  description: 'Object name (alternative to ID)',
                },
                objectType: {
                  type: 'string',
                  description: 'Object type',
                  enum: ['Table', 'TableExtension', 'Page', 'PageExtension', 'Codeunit', 'Report', 'ReportExtension', 'Enum', 'EnumExtensionType', 'Interface', 'PermissionSet', 'PermissionSetExtension', 'XmlPort', 'Query'],
                },
                packageName: {
                  type: 'string',
                  description: 'Package (for disambiguation)',
                },
                includeFields: {
                  type: 'boolean',
                  description: 'Include table fields',
                  default: true,
                },
                includeProcedures: {
                  type: 'boolean',
                  description: 'Include procedures',
                  default: true,
                },
                summaryMode: {
                  type: 'boolean',
                  description: 'Summary view (recommended)',
                  default: true,
                },
                fieldLimit: {
                  type: 'number',
                  description: 'Max fields (10 summary/100 full)',
                },
                procedureLimit: {
                  type: 'number',
                  description: 'Max procedures (10 summary/50 full)',
                },
              },
            },
          },
          {
            name: 'al_find_references',
            description: 'Find object/field references in YOUR WORKSPACE. Tracks extensions, variables, parameters, field usage, and table relations across all object types.',
            inputSchema: {
              type: 'object',
              properties: {
                targetName: {
                  type: 'string',
                  description: 'Target object or table name',
                },
                fieldName: {
                  type: 'string',
                  description: 'Field name (optional, use "*" for all fields)',
                },
                referenceType: {
                  type: 'string',
                  description: 'Reference type filter',
                  enum: ['extends', 'source_table', 'table_relation', 'field_usage', 'table_usage', 'variable', 'parameter', 'return_type'],
                },
                sourceType: {
                  type: 'string',
                  description: 'Source object type filter',
                  enum: ['Table', 'TableExtension', 'Page', 'PageExtension', 'Codeunit', 'Report', 'ReportExtension', 'Enum', 'EnumExtensionType', 'Interface', 'PermissionSet', 'PermissionSetExtension', 'XmlPort', 'Query'],
                },
                includeContext: {
                  type: 'boolean',
                  description: 'Include detailed context',
                  default: false,
                },
              },
              required: ['targetName'],
            },
          },
          {
            name: 'al_search_object_members',
            description: 'Search procedures, fields, controls, or dataitems within an object in YOUR WORKSPACE. Unified search for all object child elements.',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Parent object name',
                },
                objectType: {
                  type: 'string',
                  description: 'Object type (optional)',
                  enum: ['Table', 'TableExtension', 'Page', 'PageExtension', 'Codeunit', 'Report', 'ReportExtension', 'Query', 'XmlPort'],
                },
                memberType: {
                  type: 'string',
                  description: 'Member type to search',
                  enum: ['procedures', 'fields', 'controls', 'dataitems'],
                },
                pattern: {
                  type: 'string',
                  description: 'Filter pattern (wildcards supported)',
                },
                limit: {
                  type: 'number',
                  description: 'Max results (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Pagination offset (default: 0)',
                  default: 0,
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include full details',
                  default: true,
                },
              },
              required: ['objectName', 'memberType'],
            },
          },
          {
            name: 'al_get_object_summary',
            description: '✅ TOKEN EFFICIENT: Get categorized overview of AL object in YOUR WORKSPACE. Intelligent procedure grouping with 96% token reduction vs full definition.',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Object name',
                },
                objectType: {
                  type: 'string',
                  description: 'Object type (optional)',
                  enum: ['Table', 'TableExtension', 'Page', 'PageExtension', 'Codeunit', 'Report', 'ReportExtension', 'Enum', 'EnumExtensionType', 'Interface', 'PermissionSet', 'PermissionSetExtension', 'XmlPort', 'Query'],
                },
              },
              required: ['objectName'],
            },
          },
          {
            name: 'al_packages',
            description: 'Package management: load compiled .app packages, list loaded packages, or get stats. Auto-discovers .alpackages if path provided.',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  description: 'Action to perform',
                  enum: ['load', 'list', 'stats'],
                },
                path: {
                  type: 'string',
                  description: 'Path to packages directory or AL project root (for load action)',
                },
                autoDiscover: {
                  type: 'boolean',
                  description: 'Auto-discover .alpackages directories (default: true for load)',
                  default: true,
                },
                forceReload: {
                  type: 'boolean',
                  description: 'Force reload packages',
                  default: false,
                },
              },
              required: ['action'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Ensure AL packages are loaded before processing any tool call
        await this.ensureInitialized();

        switch (name) {
          case 'al_search_objects':
            // Handle domain filtering within search
            if (args && (args as any).domain) {
              const domainResult = await this.tools.searchByDomain(
                (args as any).domain,
                (args as any).objectType ? [(args as any).objectType] : undefined
              );
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(domainResult, null, 2),
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchObjects(args as any), null, 2),
                },
              ],
            };

          case 'al_get_object_definition':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.getObjectDefinition(args as any), null, 2),
                },
              ],
            };

          case 'al_find_references':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.findReferences(args as any), null, 2),
                },
              ],
            };

          case 'al_search_object_members':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchObjectMembers(args as any), null, 2),
                },
              ],
            };

          case 'al_get_object_summary':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.getObjectSummary((args as any).objectName, (args as any).objectType), null, 2),
                },
              ],
            };

          case 'al_packages':
            const action = (args as any)?.action;
            const path = (args as any)?.path;
            const autoDiscover = (args as any)?.autoDiscover !== false;
            const forceReload = (args as any)?.forceReload || false;

            switch (action) {
              case 'load':
                if (!path) {
                  return {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify({
                          error: 'path parameter required for load action',
                          message: 'Provide path to .alpackages directory or AL project root'
                        }, null, 2),
                      },
                    ],
                  };
                }

                if (autoDiscover) {
                  return {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify(await this.tools.autoDiscoverPackages(path), null, 2),
                      },
                    ],
                  };
                } else {
                  return {
                    content: [
                      {
                        type: 'text',
                        text: JSON.stringify(await this.tools.loadPackages({ packagesPath: path, forceReload }), null, 2),
                      },
                    ],
                  };
                }

              case 'list':
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(await this.tools.listPackages(), null, 2),
                    },
                  ],
                };

              case 'stats':
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(await this.tools.getDatabaseStats(), null, 2),
                    },
                  ],
                };

              default:
                throw new Error(`Unknown action: ${action}. Use 'load', 'list', or 'stats'`);
            }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private reportProgress(progress: ParseProgress): void {
    // Log progress to stderr so it doesn't interfere with MCP communication
    console.error(`[AL-MCP] ${progress.phase}: ${progress.processed}${progress.total ? `/${progress.total}` : ''} ${progress.currentObject || ''}`);
  }

  async start(): Promise<void> {
    // Don't auto-initialize here - wait for first tool call for better performance
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AL MCP Server started successfully (packages will be auto-loaded on first use)');
  }

  // Public methods for testing
  async initialize(): Promise<void> {
    await this.setupALCli();
    // Auto-discover packages in current working directory
    await this.tools.autoDiscoverPackages(process.cwd());
  }

  /**
   * Ensure AL packages are loaded (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    // Start initialization
    this.initializationPromise = this.performInitialization();
    await this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      console.error('🔍 Setting up AL MCP Server...');
      
      // Setup AL CLI
      await this.setupALCli();

      // No automatic package loading - require explicit tool calls
      console.error('✅ AL MCP Server ready. Use al_auto_discover or al_load_packages to load AL symbols before searching.');

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Auto-initialization failed:', error);
      // Don't throw - allow server to continue with limited functionality
      this.isInitialized = true; // Prevent retry loops
    } finally {
      this.initializationPromise = null;
    }
  }

  private async setupALCli(): Promise<void> {
    console.error('🔍 Setting up AL CLI...');
    
    const installer = new ALInstaller();
    const result = await installer.ensureALAvailable();
    
    if (result.success) {
      console.error(`✅ ${result.message}`);
      if (result.alPath) {
        this.alCli.setALCommand(result.alPath);
      }
    } else {
      console.error(`⚠️  ${result.message}`);
      
      if (result.requiresManualInstall) {
        console.error('');
        console.error(installer.getManualInstallInstructions());
      }
      
      console.error('⚡ Server will continue with limited functionality (symbol parsing will fail)');
      console.error('   MCP tools will still work for basic operations and error reporting');
    }
  }
}

// Main function for programmatic use
export async function main(): Promise<void> {
  const server = new ALMCPServer();
  await server.start();
}

// Start the server if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start AL MCP Server:', error);
    process.exit(1);
  });
}