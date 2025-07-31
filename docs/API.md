# AL MCP Server API Documentation

This document describes the MCP (Model Context Protocol) tools provided by the AL MCP Server for browsing Business Central source code dependencies.

## Table of Contents

- [Repository Management Tools](#repository-management-tools)
- [AL Object Discovery Tools](#al-object-discovery-tools)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Repository Management Tools

### al_add_branch

Add a branch to the AL repository for tracking and indexing.

**Parameters:**
- `branch` (string, required): Branch name (e.g., "w1-26", "main", "feature/new-feature")
- `shallow` (boolean, optional, default: true): Use shallow clone for space efficiency
- `auto_detect_type` (boolean, optional, default: true): Auto-detect branch type (BC version vs feature)

**Example:**
```typescript
await mcp.call("al_add_branch", {
  branch: "w1-26",
  shallow: true
});
```

**Response:**
```json
{
  "success": true,
  "branch": "w1-26",
  "type": "bc_version",
  "objectCount": 15420,
  "message": "Branch 'w1-26' added successfully"
}
```

### al_remove_branch

Remove a branch from local repository cache.

**Parameters:**
- `branch` (string, required): Branch name to remove
- `cleanup_local` (boolean, optional, default: true): Also remove local references and cached data

**Example:**
```typescript
await mcp.call("al_remove_branch", {
  branch: "old-feature",
  cleanup_local: true
});
```

### al_set_repository

Initialize or switch to a different AL repository.

**Parameters:**
- `repo_url` (string, optional): Git repository URL
- `repo_path` (string, optional): Local repository path (alternative to repo_url)
- `repo_type` (string, optional): Repository type ("bc-history-sandbox", "bc-fork", "al-extension", "local-development")
- `DEFAULT_BRANCH` (string[], optional): Branches to initially track

**Example:**
```typescript
await mcp.call("al_set_repository", {
  repo_url: "https://github.com/your-org/CustomBC.git",
  repo_type: "bc-fork",
  DEFAULT_BRANCH: ["main", "develop"]
});
```

### al_list_branches

List available and tracked branches in the AL repository.

**Parameters:**
- `filter` (string, optional): Filter pattern (e.g., "w1-*", "feature/*")
- `include_remote` (boolean, optional, default: false): Include remote branches not yet tracked
- `branch_type` (string, optional): Filter by type ("bc_version", "feature", "release", "all")

**Example:**
```typescript
await mcp.call("al_list_branches", {
  filter: "w1-*",
  branch_type: "bc_version"
});
```

### al_repo_status

Get current repository status, statistics, and health information.

**Parameters:**
- `detailed` (boolean, optional, default: false): Include detailed statistics
- `include_performance` (boolean, optional, default: false): Include performance metrics
- `health_check` (boolean, optional, default: true): Perform health validation

**Example:**
```typescript
await mcp.call("al_repo_status", {
  detailed: true,
  include_performance: true
});
```

## AL Object Discovery Tools

### al_search_objects

Search for AL objects across branches with advanced filtering.

**Parameters:**
- `query` (string, required): Search query (object name, pattern, or keyword)
- `object_type` (string, optional): Filter by AL object type
- `branches` (string[], optional): Branches to search (default: all available)
- `namespace` (string, optional): Filter by namespace (e.g., "Microsoft.*")
- `id_range` (string, optional): Filter by object ID range ("50000-59999", "AppSource", "PTE")
- `include_obsolete` (boolean, optional, default: false): Include obsolete objects

**Example:**
```typescript
// Find Customer table across BC versions
await mcp.call("al_search_objects", {
  query: "Customer",
  object_type: "table",
  branches: ["w1-26", "w1-24"],
  include_obsolete: false
});

// Search objects by Microsoft namespace
await mcp.call("al_search_objects", {
  query: "*",
  namespace: "Microsoft.*"
});
```

**Response:**
```json
{
  "objects": [
    {
      "type": "table",
      "name": "Customer",
      "id": 18,
      "namespace": null,
      "filePath": "src/BaseApp/Customer.Table.al",
      "branch": "w1-26"
    }
  ],
  "totalCount": 1,
  "branches": ["w1-26", "w1-24"],
  "searchTime": 245,
  "filters": {
    "query": "Customer",
    "object_type": "table"
  }
}
```

### al_get_object

Get detailed information about a specific AL object.

**Parameters:**
- `object_type` (string, required): AL object type
- `object_name` (string, optional): Object name
- `object_id` (number, optional): Object ID (alternative to name)
- `branch` (string, optional): Specific branch to search
- `include_dependencies` (boolean, optional, default: false): Include dependencies
- `include_events` (boolean, optional, default: false): Include events
- `include_permissions` (boolean, optional, default: false): Include permissions

**Large Object Handling Parameters:**
- `include_summary_only` (boolean, default: false): Return only basic object information to reduce response size
- `include_procedures` (boolean, default: true): Include procedures (for codeunits). Set to false to reduce large responses
- `include_variables` (boolean, default: true): Include variables (for codeunits). Set to false to reduce large responses  
- `include_triggers` (boolean, default: true): Include triggers. Set to false to reduce large responses
- `max_procedures` (number): Maximum number of procedures to include (helpful for very large codeunits)
- `max_variables` (number): Maximum number of variables to include (helpful for very large codeunits)
- `include_source_code` (boolean, default: false): Include the actual AL source code content. WARNING: This can significantly increase response size

**Examples:**
```typescript
// Full object details
await mcp.call("al_get_object", {
  object_type: "codeunit",
  object_name: "Approval Management",
  include_dependencies: true,
  include_events: true
});

// Summary only for large objects
await mcp.call("al_get_object", {
  object_type: "codeunit", 
  object_id: 80,
  include_summary_only: true
});

// Limited procedures for large codeunits
await mcp.call("al_get_object", {
  object_type: "codeunit",
  object_id: 80, 
  max_procedures: 10,
  include_variables: false
});

// Get source code for specific analysis
await mcp.call("al_get_object", {
  object_type: "codeunit",
  object_name: "Small Helper Codeunit",
  include_source_code: true,
  include_procedures: false,
  include_variables: false
});
```

### al_find_relationships

Find relationships between AL objects (extends, implements, uses).

**Parameters:**
- `source_object` (string, required): Source object to analyze
- `relationship_type` (string, optional, default: "all"): Type of relationships ("extends", "implements", "uses", "used_by", "events", "all")
- `max_depth` (number, optional, default: 2): Maximum relationship depth to traverse
- `branches` (string[], optional): Branches to search in

**Example:**
```typescript
await mcp.call("al_find_relationships", {
  source_object: "Customer",
  relationship_type: "uses",
  max_depth: 3,
  branches: ["w1-26"]
});
```


### al_workspace_overview

Get overview of AL development workspace and project structure.

**Parameters:**
- `workspace_path` (string, optional): Workspace path (if different from configured)
- `include_dependencies` (boolean, optional, default: true): Include dependencies
- `scan_depth` (number, optional, default: 2): Directory scan depth

**Example:**
```typescript
await mcp.call("al_workspace_overview", {
  include_dependencies: true
});
```

## Error Handling

All tools follow consistent error handling patterns:

### Success Response
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\": true, \"data\": {...}}"
    }
  ]
}
```

### Error Response
```json
{
  "error": {
    "code": -32000,
    "message": "Tool execution failed: Branch 'invalid-branch' does not exist"
  }
}
```

### Common Error Codes
- `InvalidParams`: Missing or invalid parameters
- `MethodNotFound`: Unknown tool name
- `InternalError`: Server-side error during execution

## Examples

### Complete Workflow Example

```typescript
// 1. Check repository status
const status = await mcp.call("al_repo_status", { detailed: true });

// 2. Add a new branch for analysis
await mcp.call("al_add_branch", { branch: "w1-26" });

// 3. Search for objects in the new branch
const searchResults = await mcp.call("al_search_objects", {
  query: "Approval",
  branches: ["w1-26"],
  namespace: "STM.*"
});

// 4. Get detailed information about found objects
for (const obj of searchResults.objects) {
  const details = await mcp.call("al_get_object", {
    object_type: obj.type,
    object_name: obj.name,
    branch: obj.branch,
    include_dependencies: true
  });
  console.log(details);
}

// 5. Find object relationships
const relationships = await mcp.call("al_find_relationships", {
  source_object: "Customer",
  relationship_type: "uses",
  max_depth: 2,
  branches: ["w1-26"]
});
```

### Code Browsing Example

```typescript
// Browse BC dependency code for understanding
const browseDependencies = async () => {
  // Get workspace overview
  const overview = await mcp.call("al_workspace_overview", {
    include_dependencies: true
  });
  
  // Search for base objects used in dependencies
  const baseObjects = await mcp.call("al_search_objects", {
    query: "Customer",
    namespace: "Microsoft.*",
    branches: ["w1-26"]
  });
  
  // Get detailed information about dependency objects
  for (const obj of baseObjects.objects) {
    const details = await mcp.call("al_get_object", {
      object_type: obj.type,
      object_name: obj.name,
      branch: obj.branch,
      include_dependencies: true
    });
    
    console.log(`Object details for ${obj.name}:`, details);
  }
  
  // Find relationships to understand object usage
  const relationships = await mcp.call("al_find_relationships", {
    source_object: "Customer",
    relationship_type: "all",
    max_depth: 2,
    branches: ["w1-26"]
  });
  
  return relationships;
};
```

## Rate Limiting and Performance

The server implements several performance optimizations:

- **Search caching**: Frequently used searches are cached for faster response
- **Incremental indexing**: Only changed files are re-indexed
- **Branch isolation**: Each branch maintains its own index for parallel operations
- **Memory management**: Automatic cleanup of unused data structures

## Security Considerations

- **Read-only access**: Server only reads repository data, never modifies
- **Container isolation**: Runs in isolated Docker environment
- **No credential storage**: Uses external authentication mechanisms
- **Audit logging**: All operations are logged for security monitoring