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
            description: 'Search AL objects across loaded packages. ⚠️ WARNING: Can generate large responses (10K+ tokens). Use summaryMode:true and limit parameters to avoid token limits. For complex objects with many procedures, consider using al_get_object_summary instead.',
            inputSchema: {
              type: 'object',
              properties: {
                pattern: {
                  type: 'string',
                  description: 'Search pattern (supports wildcards like "Customer*" or "*Ledger*")',
                },
                objectType: {
                  type: 'string',
                  description: 'Filter by object type (Table, Page, Codeunit, Report, Enum, etc.)',
                  enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum', 'Interface', 'PermissionSet', 'XmlPort', 'Query'],
                },
                packageName: {
                  type: 'string',
                  description: 'Filter by package name',
                },
                includeFields: {
                  type: 'boolean',
                  description: 'Include field definitions for tables. ⚠️ WARNING: Significantly increases token usage',
                  default: false,
                },
                includeProcedures: {
                  type: 'boolean',
                  description: 'Include procedure definitions. ⚠️ WARNING: Can cause very large responses (15K+ tokens)',
                  default: false,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of objects to return (default: 20, max: 100)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Number of objects to skip for pagination (default: 0)',
                  default: 0,
                },
                summaryMode: {
                  type: 'boolean',
                  description: 'Return summary view with limited details (default: true)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'al_get_object_definition',
            description: 'Get complete definition of a specific AL object. ⚠️ WARNING: Can be large for complex objects (3K+ tokens). Use summaryMode:true and procedureLimit for large codeunits. For function overviews, use al_get_object_summary instead.',
            inputSchema: {
              type: 'object',
              properties: {
                objectId: {
                  type: 'number',
                  description: 'Object ID (e.g., 18 for Customer table)',
                },
                objectName: {
                  type: 'string',
                  description: 'Object name (alternative to objectId)',
                },
                objectType: {
                  type: 'string',
                  description: 'Object type',
                  enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum', 'Interface', 'PermissionSet', 'XmlPort', 'Query'],
                },
                packageName: {
                  type: 'string',
                  description: 'Package name to resolve conflicts',
                },
                includeFields: {
                  type: 'boolean',
                  description: 'Include field definitions for tables (default: true)',
                  default: true,
                },
                includeProcedures: {
                  type: 'boolean',
                  description: 'Include procedure definitions for codeunits. ⚠️ WARNING: Can be very large for complex objects (default: true)',
                  default: true,
                },
                summaryMode: {
                  type: 'boolean',
                  description: 'Return summary view with limited details. ✅ RECOMMENDED: true for token efficiency (default: true)',
                  default: true,
                },
                fieldLimit: {
                  type: 'number',
                  description: 'Maximum number of fields to return (default: 10 summary, 100 full)',
                },
                procedureLimit: {
                  type: 'number',
                  description: 'Maximum number of procedures to return (default: 10 summary, 50 full)',
                },
              },
            },
          },
          {
            name: 'al_find_references',
            description: 'Find objects that reference a target object',
            inputSchema: {
              type: 'object',
              properties: {
                targetName: {
                  type: 'string',
                  description: 'Name of the target object to find references to',
                },
                referenceType: {
                  type: 'string',
                  description: 'Type of reference to find',
                  enum: ['extends', 'uses', 'calls', 'table_relation', 'source_table'],
                },
                sourceType: {
                  type: 'string',
                  description: 'Filter by source object type',
                  enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum', 'Interface', 'Field'],
                },
              },
              required: ['targetName'],
            },
          },
          {
            name: 'al_load_packages',
            description: 'Load AL packages from a specified directory',
            inputSchema: {
              type: 'object',
              properties: {
                packagesPath: {
                  type: 'string',
                  description: 'Path to directory containing .app files',
                },
                forceReload: {
                  type: 'boolean',
                  description: 'Force reload even if packages are already loaded',
                  default: false,
                },
              },
              required: ['packagesPath'],
            },
          },
          {
            name: 'al_list_packages',
            description: 'List currently loaded packages',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'al_auto_discover',
            description: 'Auto-discover and load AL packages from .alpackages directories',
            inputSchema: {
              type: 'object',
              properties: {
                rootPath: {
                  type: 'string',
                  description: 'Root path to search for .alpackages directories',
                  default: '.',
                },
              },
            },
          },
          {
            name: 'al_get_stats',
            description: 'Get database statistics and performance metrics',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'al_search_by_domain',
            description: 'Search objects by business domain (Sales, Finance, Inventory, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                domain: {
                  type: 'string',
                  description: 'Business domain to search',
                  enum: ['Sales', 'Purchasing', 'Finance', 'Inventory', 'Manufacturing', 'Service'],
                },
                objectTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum'],
                  },
                  description: 'Filter by object types',
                },
              },
              required: ['domain'],
            },
          },
          {
            name: 'al_get_extensions',
            description: 'Get objects that extend a base object',
            inputSchema: {
              type: 'object',
              properties: {
                baseObjectName: {
                  type: 'string',
                  description: 'Name of the base object to find extensions for',
                },
              },
              required: ['baseObjectName'],
            },
          },
          {
            name: 'al_search_procedures',
            description: 'Search procedures within a specific AL object (codeunit, table, page, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Name of the object to search procedures in',
                },
                objectType: {
                  type: 'string',
                  description: 'Type of object (optional for disambiguation)',
                  enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum', 'Interface', 'PermissionSet', 'XmlPort', 'Query'],
                },
                procedurePattern: {
                  type: 'string',
                  description: 'Pattern to filter procedures (supports wildcards like "*Code*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of procedures to return (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Number of procedures to skip for pagination (default: 0)',
                  default: 0,
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include full procedure details or just names (default: true)',
                  default: true,
                },
              },
              required: ['objectName'],
            },
          },
          {
            name: 'al_search_fields',
            description: 'Search fields within a specific table',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Name of the table to search fields in',
                },
                fieldPattern: {
                  type: 'string',
                  description: 'Pattern to filter fields (supports wildcards like "*Code*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of fields to return (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Number of fields to skip for pagination (default: 0)',
                  default: 0,
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include full field details or just basic info (default: true)',
                  default: true,
                },
              },
              required: ['objectName'],
            },
          },
          {
            name: 'al_search_controls',
            description: 'Search controls within a specific page',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Name of the page to search controls in',
                },
                controlPattern: {
                  type: 'string',
                  description: 'Pattern to filter controls (supports wildcards like "*Button*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of controls to return (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Number of controls to skip for pagination (default: 0)',
                  default: 0,
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include full control details or just basic info (default: true)',
                  default: true,
                },
              },
              required: ['objectName'],
            },
          },
          {
            name: 'al_search_dataitems',
            description: 'Search data items within reports, queries, or xmlports',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Name of the report/query/xmlport to search data items in',
                },
                dataItemPattern: {
                  type: 'string',
                  description: 'Pattern to filter data items (supports wildcards like "*Header*")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of data items to return (default: 20)',
                  default: 20,
                },
                offset: {
                  type: 'number',
                  description: 'Number of data items to skip for pagination (default: 0)',
                  default: 0,
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include full data item details or just basic info (default: true)',
                  default: true,
                },
              },
              required: ['objectName'],
            },
          },
          {
            name: 'al_get_object_summary',
            description: '✅ TOKEN EFFICIENT: Get intelligent summary of AL objects with categorized procedures/functions. Perfect for complex codeunits like Sales-Post (96% token reduction vs detailed view). Returns organized categories instead of overwhelming raw lists.',
            inputSchema: {
              type: 'object',
              properties: {
                objectName: {
                  type: 'string',
                  description: 'Name of the object to summarize',
                },
                objectType: {
                  type: 'string',
                  description: 'Type of object (optional for disambiguation)',
                  enum: ['Table', 'Page', 'Codeunit', 'Report', 'Enum', 'Interface', 'PermissionSet', 'XmlPort', 'Query'],
                },
              },
              required: ['objectName'],
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

          case 'al_load_packages':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.loadPackages(args as any), null, 2),
                },
              ],
            };

          case 'al_list_packages':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.listPackages(), null, 2),
                },
              ],
            };

          case 'al_auto_discover':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.autoDiscoverPackages((args && (args as any).rootPath) || '.'), null, 2),
                },
              ],
            };

          case 'al_get_stats':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.getDatabaseStats(), null, 2),
                },
              ],
            };

          case 'al_search_by_domain':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchByDomain((args && (args as any).domain) || '', (args && (args as any).objectTypes)), null, 2),
                },
              ],
            };

          case 'al_get_extensions':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.getObjectExtensions((args && (args as any).baseObjectName) || ''), null, 2),
                },
              ],
            };

          case 'al_search_procedures':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchProcedures(args as any), null, 2),
                },
              ],
            };

          case 'al_search_fields':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchFields(args as any), null, 2),
                },
              ],
            };

          case 'al_search_controls':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchControls(args as any), null, 2),
                },
              ],
            };

          case 'al_search_dataitems':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await this.tools.searchDataItems(args as any), null, 2),
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
      console.error('🔍 Auto-loading AL packages...');
      
      // Setup AL CLI
      await this.setupALCli();

      // Try to auto-discover AL packages in current working directory only
      const searchPaths = [
        process.cwd() // Current working directory only
      ];

      let packagesLoaded = false;
      
      for (const searchPath of searchPaths) {
        try {
          const result = await this.tools.autoDiscoverPackages(searchPath);
          if (result.packages.length > 0) {
            console.error(`✅ Auto-loaded ${result.packages.length} AL packages from ${searchPath}`);
            packagesLoaded = true;
            break;
          }
        } catch (error) {
          // Continue to next search path
          continue;
        }
      }

      if (!packagesLoaded) {
        console.error('⚠️  No AL packages found in common locations. Use al_load_packages to load from specific directory.');
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Auto-initialization failed:', error);
      // Don't throw - allow server to continue with limited functionality
      this.isInitialized = true; // Prevent retry loops
    } finally {
      this.initializationPromise = null;
    }
  }

  async handleToolCall(request: { name: string; arguments: any }): Promise<any> {
    const { name, arguments: args } = request;

    // Ensure AL packages are loaded before processing any tool call
    await this.ensureInitialized();

    switch (name) {
      case 'al_search_objects':
        return {
          content: await this.tools.searchObjects(args as any)
        };

      case 'al_get_object_definition':
        return {
          content: await this.tools.getObjectDefinition(args as any)
        };

      case 'al_list_packages':
        return {
          content: await this.tools.listPackages()
        };

      case 'al_auto_discover':
        return {
          content: await this.tools.autoDiscoverPackages(args.rootPath || '.')
        };

      case 'al_get_stats':
        return {
          content: await this.tools.getDatabaseStats()
        };

      case 'al_search_by_domain':
        return {
          content: await this.tools.searchByDomain(args.domain, args.objectTypes)
        };

      case 'al_find_references':
        return {
          content: await this.tools.findReferences(args as any)
        };

      case 'al_load_packages':
        return {
          content: await this.tools.loadPackages(args as any)
        };

      case 'al_get_object_extensions':
        return {
          content: await this.tools.getObjectExtensions(args.baseObjectName)
        };

      case 'al_search_procedures':
        return {
          content: await this.tools.searchProcedures(args as any)
        };

      case 'al_search_fields':
        return {
          content: await this.tools.searchFields(args as any)
        };

      case 'al_search_controls':
        return {
          content: await this.tools.searchControls(args as any)
        };

      case 'al_search_dataitems':
        return {
          content: await this.tools.searchDataItems(args as any)
        };

      case 'al_get_object_summary':
        return {
          content: await this.tools.getObjectSummary(args.objectName, args.objectType)
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
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