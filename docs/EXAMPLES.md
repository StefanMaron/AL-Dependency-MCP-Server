# AL MCP Server Usage Examples

This document provides comprehensive examples of using the AL MCP Server for browsing Business Central code dependencies.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Dependency Browsing](#dependency-browsing)
- [Code Discovery](#code-discovery)
- [Advanced Scenarios](#advanced-scenarios)
- [Integration Examples](#integration-examples)

## Basic Usage

### Repository Setup and Status

```typescript
// Check current repository status
const status = await mcp.call("al_repo_status", {
  detailed: true,
  include_performance: true,
  health_check: true
});

console.log(`Repository: ${status.url}`);
console.log(`Total objects: ${status.totalObjects}`);
console.log(`Branches: ${status.branches.length}`);
console.log(`Index health: ${status.indexHealth}`);

// List all available branches
const branches = await mcp.call("al_list_branches", {
  filter: "w1-*",
  branch_type: "bc_version"
});

console.log("Available BC versions:");
branches.branches.forEach(branch => {
  console.log(`- ${branch.name} (${branch.objectCount} objects)`);
});
```

### Adding and Managing Branches

```typescript
// Add latest BC version branch
await mcp.call("al_add_branch", {
  branch: "w1-26",
  shallow: true,
  auto_detect_type: true
});

// Add a feature branch
await mcp.call("al_add_branch", {
  branch: "feature/power-automate-integration",
  shallow: false  // Full history for feature development
});

// Remove old branch
await mcp.call("al_remove_branch", {
  branch: "w1-22",
  cleanup_local: true
});
```

### Basic Object Search

```typescript
// Find all Customer-related objects
const customerObjects = await mcp.call("al_search_objects", {
  query: "Customer",
  branches: ["w1-26"],
  include_obsolete: false
});

console.log(`Found ${customerObjects.totalCount} Customer objects:`);
customerObjects.objects.forEach(obj => {
  console.log(`- ${obj.type} ${obj.name} (ID: ${obj.id})`);
});

// Search by object type
const allTables = await mcp.call("al_search_objects", {
  query: "*",
  object_type: "table",
  branches: ["w1-26"],
  maxResults: 50
});

console.log(`BC 26 has ${allTables.totalCount} tables`);
```

## Dependency Browsing

### Finding Objects by Namespace

```typescript
// Search for objects by Microsoft namespace
const microsoftObjects = await mcp.call("al_search_objects", {
  query: "*",
  namespace: "Microsoft.*",
  branches: ["w1-26"]
});

console.log("Microsoft Objects by Type:");
const objectsByType = {};
microsoftObjects.objects.forEach(obj => {
  objectsByType[obj.type] = (objectsByType[obj.type] || 0) + 1;
});
console.log(objectsByType);

// Get detailed information about specific objects
const approvalObjects = await mcp.call("al_search_objects", {
  query: "Approval",
  branches: ["w1-26"]
});

for (const obj of approvalObjects.objects) {
  const details = await mcp.call("al_get_object", {
    object_type: obj.type,
    object_name: obj.name,
    branch: obj.branch,
    include_dependencies: true,
    include_events: true
  });
  
  console.log(`\n${obj.type} ${obj.name}:`);
  console.log(`  Dependencies: ${details.dependencies?.length || 0}`);
  console.log(`  Events: ${details.events?.length || 0}`);
}
```

### Understanding Code Structure

```typescript
// Get workspace overview to understand project structure
const workspaceOverview = await mcp.call("al_workspace_overview", {
  include_dependencies: true
});

console.log("Workspace Analysis:");
console.log(`- Projects: ${workspaceOverview.projects.length}`);
console.log(`- Total Objects: ${workspaceOverview.structure.totalObjects}`);
console.log(`- Dependencies: ${workspaceOverview.structure.dependencies.length}`);

// Browse project dependencies
workspaceOverview.projects.forEach(project => {
  console.log(`\nProject: ${project.name}`);
  console.log(`  Type: ${project.type}`);
  console.log(`  Dependencies: ${project.dependencies.length}`);
  Object.entries(project.objects).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
});
```

### Exploring Object Relationships

```typescript
// Find objects that reference Customer table
const customerRelationships = await mcp.call("al_find_relationships", {
  source_object: "Customer",
  relationship_type: "used_by",
  max_depth: 2,
  branches: ["w1-26"]
});

console.log("Objects that use Customer table:");
customerRelationships.edges.forEach(edge => {
  console.log(`- ${edge.source.type} ${edge.source.name} -> ${edge.target.name}`);
});

// Discover integration points
const integrationObjects = await mcp.call("al_search_objects", {
  query: "Integration",
  branches: ["w1-26"]
});

console.log(`\nIntegration Objects Found: ${integrationObjects.totalCount}`);
integrationObjects.objects.forEach(obj => {
  console.log(`- ${obj.type} ${obj.name} (${obj.filePath})`);
});
```

## Code Discovery

### Finding Specific Implementations

```typescript
// Discover how specific functionality is implemented
const implementationSearch = await mcp.call("al_search_objects", {
  query: "Report",
  object_type: "codeunit",
  branches: ["w1-26"]
});

console.log("Report-related Codeunits:");
for (const obj of implementationSearch.objects.slice(0, 5)) {
  const details = await mcp.call("al_get_object", {
    object_type: obj.type,
    object_name: obj.name,
    branch: obj.branch,
    include_dependencies: true
  });
  
  console.log(`\n${obj.name}:`);
  console.log(`  File: ${obj.filePath}`);
  console.log(`  Dependencies: ${details.dependencies?.length || 0}`);
  
  // Show key dependencies
  if (details.dependencies) {
    const keyDeps = details.dependencies.slice(0, 3);
    keyDeps.forEach(dep => {
      console.log(`    - Uses: ${dep.type} ${dep.name}`);
    });
  }
}
```

### Cross-Version Object Comparison

```typescript
// Compare object implementations across BC versions
const objectName = "Approval Entry";

// Get object from BC 24
const bc24Object = await mcp.call("al_get_object", {
  object_type: "table",
  object_name: objectName,
  branch: "w1-24",
  include_dependencies: true
});

// Get object from BC 26
const bc26Object = await mcp.call("al_get_object", {
  object_type: "table", 
  object_name: objectName,
  branch: "w1-26",
  include_dependencies: true
});

console.log(`Comparing "${objectName}" between BC versions:`);
console.log(`BC 24 - Dependencies: ${bc24Object.dependencies?.length || 0}`);
console.log(`BC 26 - Dependencies: ${bc26Object.dependencies?.length || 0}`);

// Find new dependencies in BC 26
if (bc24Object.dependencies && bc26Object.dependencies) {
  const newDeps = bc26Object.dependencies.filter(dep26 =>
    !bc24Object.dependencies.some(dep24 => 
      dep24.name === dep26.name && dep24.type === dep26.type
    )
  );
  
  if (newDeps.length > 0) {
    console.log("\nNew dependencies in BC 26:");
    newDeps.forEach(dep => {
      console.log(`- ${dep.type} ${dep.name}`);
    });
  }
}
```


## Advanced Scenarios

### Multi-Branch Analysis

```typescript
// Compare object implementations across multiple branches
const branches = ["w1-24", "w1-25", "w1-26"];
const objectName = "Customer";

const crossBranchAnalysis = {};

for (const branch of branches) {
  const objects = await mcp.call("al_search_objects", {
    query: objectName,
    object_type: "table",
    branches: [branch],
    include_obsolete: false
  });
  
  if (objects.objects.length > 0) {
    const details = await mcp.call("al_get_object", {
      object_type: "table",
      object_name: objectName,
      branch: branch,
      include_dependencies: true
    });
    
    crossBranchAnalysis[branch] = {
      found: true,
      dependencies: details.dependencies?.length || 0,
      isObsolete: details.isObsolete || false
    };
  } else {
    crossBranchAnalysis[branch] = { found: false };
  }
}

console.log(`Cross-branch analysis for ${objectName}:`);
Object.entries(crossBranchAnalysis).forEach(([branch, info]) => {
  if (info.found) {
    console.log(`- ${branch}: Found, ${info.dependencies} deps, obsolete: ${info.isObsolete}`);
  } else {
    console.log(`- ${branch}: Not found`);
  }
});
```

### Large-Scale Object Discovery

```typescript
// Find all tables in AppSource ID range across all branches
const appSourceTables = await mcp.call("al_search_objects", {
  query: "*",
  object_type: "table",
  id_range: "100000-999999999",
  include_obsolete: false
});

console.log(`AppSource Tables: ${appSourceTables.totalCount}`);

// Group by branch
const branchGroups = {};
appSourceTables.objects.forEach(obj => {
  if (!branchGroups[obj.branch]) {
    branchGroups[obj.branch] = [];
  }
  branchGroups[obj.branch].push(obj);
});

Object.entries(branchGroups).forEach(([branch, objects]) => {
  console.log(`- ${branch}: ${objects.length} AppSource tables`);
});

// Find tables with most dependencies
const tablesWithDeps = [];
for (const table of appSourceTables.objects.slice(0, 10)) { // Limit for performance
  const relationships = await mcp.call("al_find_relationships", {
    source_object: table.name,
    relationship_type: "used_by",
    max_depth: 1,
    branches: [table.branch]
  });
  
  tablesWithDeps.push({
    name: table.name,
    branch: table.branch,
    usedBy: relationships.edges.length
  });
}

// Sort by usage
tablesWithDeps.sort((a, b) => b.usedBy - a.usedBy);
console.log("\nMost Referenced Tables:");
tablesWithDeps.slice(0, 5).forEach(table => {
  console.log(`- ${table.name} (${table.branch}): Used by ${table.usedBy} objects`);
});
```

### Performance Analysis

```typescript
// Analyze repository performance and health
const performanceAnalysis = await mcp.call("al_repo_status", {
  detailed: true,
  include_performance: true,
  health_check: true
});

console.log("Repository Performance Metrics:");
if (performanceAnalysis.performance) {
  console.log(`- Index size: ${performanceAnalysis.performance.indexSize} objects`);
  console.log(`- Average search time: ${performanceAnalysis.performance.avgSearchTime}ms`);
  console.log(`- Cache hit rate: ${(performanceAnalysis.performance.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`- Total searches: ${performanceAnalysis.performance.totalSearches}`);
}

if (performanceAnalysis.health) {
  console.log("\nHealth Status:");
  console.log(`- Git: ${performanceAnalysis.health.git.status}`);
  console.log(`- Indexer: ${performanceAnalysis.health.indexer.status}`);
  console.log(`- Parser: ${performanceAnalysis.health.parser.status}`);
}

// Benchmark search performance
const searchQueries = [
  { query: "Customer", object_type: "table" },
  { query: "Sales", object_type: "page" },
  { query: "*", namespace: "Microsoft.*" },
  { query: "Approval", id_range: "50000-59999" }
];

console.log("\nSearch Performance Benchmark:");
for (const searchQuery of searchQueries) {
  const startTime = Date.now();
  const results = await mcp.call("al_search_objects", searchQuery);
  const searchTime = Date.now() - startTime;
  
  console.log(`- "${searchQuery.query}": ${results.totalCount} objects in ${searchTime}ms`);
}
```

## Integration Examples

### GitHub Actions Workflow

```yaml
# .github/workflows/al-analysis.yml
name: AL Extension Analysis

on:
  pull_request:
    paths: ['**/*.al', '**/app.json']

jobs:
  analyze:
    runs-on: ubuntu-latest
    services:
      al-mcp-server:
        image: al-mcp-server:latest
        ports:
          - 3000:3000
        env:
          REPO_TYPE: bc-history-sandbox
          DEFAULT_BRANCHES: w1-26,w1-24
          
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install MCP Client
        run: npm install -g @modelcontextprotocol/cli
        
      - name: Wait for AL MCP Server
        run: |
          timeout 120 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'
          
      - name: Analyze Extension Structure
        run: |
          mcp call al_analyze_extension '{
            "extension_path": ".",
            "analysis_type": "structure",
            "include_transitive": true
          }' > analysis-structure.json
          
      - name: Browse Code Dependencies
        run: |
          mcp call al_search_objects '{
            "query": "*",
            "branches": ["w1-26"]
          }' > dependencies-overview.json
          
      - name: Find Object Relationships
        run: |
          mcp call al_find_relationships '{
            "source_object": "Customer",
            "relationship_type": "all",
            "max_depth": 2,
            "branches": ["w1-26"]
          }' > object-relationships.json
          
      - name: Upload Analysis Results
        uses: actions/upload-artifact@v3
        with:
          name: dependency-analysis-results
          path: dependencies-*.json && object-*.json
```

### VS Code Extension Integration

```typescript
// VS Code extension integration example
import * as vscode from 'vscode';

class ALMCPProvider {
  private mcpEndpoint = 'http://localhost:3000';
  
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const lineText = document.lineAt(position).text;
    const completionItems: vscode.CompletionItem[] = [];
    
    // Detect if we're writing an object reference
    if (lineText.includes('SourceTable') || lineText.includes('TableRelation')) {
      const tables = await this.searchALObjects('*', 'table');
      
      tables.objects.forEach(table => {
        const item = new vscode.CompletionItem(
          table.name,
          vscode.CompletionItemKind.Reference
        );
        item.detail = `Table ${table.id} - ${table.branch}`;
        item.insertText = `"${table.name}"`;
        completionItems.push(item);
      });
    }
    
    return completionItems;
  }
  
  private async searchALObjects(query: string, objectType: string) {
    const response = await fetch(`${this.mcpEndpoint}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'call_tool',
        params: {
          name: 'al_search_objects',
          arguments: {
            query,
            object_type: objectType,
            branches: ['w1-26']
          }
        }
      })
    });
    
    return await response.json();
  }
}
```

### PowerShell Integration

```powershell
# PowerShell script for AL MCP Server integration
function Invoke-ALMCPTool {
    param(
        [string]$ToolName,
        [hashtable]$Parameters,
        [string]$MCPEndpoint = "http://localhost:3000"
    )
    
    $body = @{
        method = "call_tool"
        params = @{
            name = $ToolName
            arguments = $Parameters
        }
    } | ConvertTo-Json -Depth 10
    
    $response = Invoke-RestMethod -Uri "$MCPEndpoint/mcp" -Method POST -Body $body -ContentType "application/json"
    return $response
}

# Example usage
$repoStatus = Invoke-ALMCPTool -ToolName "al_repo_status" -Parameters @{
    detailed = $true
    include_performance = $true
}

Write-Host "Repository Status:"
Write-Host "- Total Objects: $($repoStatus.totalObjects)"
Write-Host "- Branches: $($repoStatus.branches.Count)"
Write-Host "- Health: $($repoStatus.indexHealth)"

# Search for Microsoft base objects
$msObjects = Invoke-ALMCPTool -ToolName "al_search_objects" -Parameters @{
    query = "Customer"
    namespace = "Microsoft.*"
}

Write-Host "`nMicrosoft Objects Found: $($msObjects.totalCount)"
foreach ($obj in $msObjects.objects | Select-Object -First 10) {
    Write-Host "- $($obj.type) $($obj.name) (ID: $($obj.id))"
}
```

These examples demonstrate the versatility and power of the AL MCP Server for various AL development scenarios, from basic object discovery to complex cross-version analysis and CI/CD integration.