#!/bin/bash

# AL MCP Server - AL Project Structure Detection Script
# Analyzes AL projects and workspaces to understand their structure

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCAN_PATH="${1:-/app/repo-cache}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-table}"
MAX_DEPTH="${MAX_DEPTH:-3}"
INCLUDE_STATS="${INCLUDE_STATS:-true}"
VERBOSE="${VERBOSE:-false}"

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

show_usage() {
    cat << EOF
AL MCP Server - AL Structure Detection Script

Usage: $0 [PATH] [OPTIONS]

Arguments:
  PATH                    Path to scan for AL projects (default: /app/repo-cache)

Options:
  --format FORMAT         Output format: table, json, yaml (default: table)
  --max-depth N          Maximum directory depth to scan (default: 3)
  --no-stats             Skip file statistics collection
  --verbose              Verbose output
  --help                 Show this help message

Environment Variables:
  OUTPUT_FORMAT          Output format (default: table)
  MAX_DEPTH             Maximum scan depth (default: 3)
  INCLUDE_STATS         Include statistics (default: true)
  VERBOSE               Verbose mode (default: false)

Examples:
  $0                                    # Scan default path with table output
  $0 /workspace --format json          # Scan workspace and output JSON
  $0 --no-stats --verbose             # Quick scan with verbose output

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --max-depth)
                MAX_DEPTH="$2"
                shift 2
                ;;
            --no-stats)
                INCLUDE_STATS="false"
                shift
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                SCAN_PATH="$1"
                shift
                ;;
        esac
    done
}

check_path() {
    if [ ! -d "$SCAN_PATH" ]; then
        log_error "Path does not exist: $SCAN_PATH"
        exit 1
    fi
    
    if [ ! -r "$SCAN_PATH" ]; then
        log_error "Path is not readable: $SCAN_PATH"
        exit 1
    fi
    
    [ "$VERBOSE" = "true" ] && log "Scanning path: $SCAN_PATH"
}

find_app_json_files() {
    local path="$1"
    local max_depth="$2"
    
    find "$path" -maxdepth "$max_depth" -name "app.json" -type f 2>/dev/null || true
}

find_al_files() {
    local path="$1"
    local max_depth="$2"
    
    find "$path" -maxdepth "$max_depth" -name "*.al" -type f 2>/dev/null || true
}

analyze_app_json() {
    local app_json_file="$1"
    local project_info=""
    
    if [ ! -f "$app_json_file" ]; then
        echo "ERROR: File not found"
        return 1
    fi
    
    # Parse JSON using available tools (jq if available, otherwise basic parsing)
    if command -v jq &> /dev/null; then
        local name publisher version target runtime platform dependencies
        
        name=$(jq -r '.name // "Unknown"' "$app_json_file" 2>/dev/null || echo "Unknown")
        publisher=$(jq -r '.publisher // "Unknown"' "$app_json_file" 2>/dev/null || echo "Unknown")
        version=$(jq -r '.version // "1.0.0.0"' "$app_json_file" 2>/dev/null || echo "1.0.0.0")
        target=$(jq -r '.target // "OnPrem"' "$app_json_file" 2>/dev/null || echo "OnPrem")
        runtime=$(jq -r '.runtime // "Unknown"' "$app_json_file" 2>/dev/null || echo "Unknown")
        platform=$(jq -r '.platform // "Unknown"' "$app_json_file" 2>/dev/null || echo "Unknown")
        
        # Count dependencies
        local dep_count
        dep_count=$(jq -r '.dependencies | length' "$app_json_file" 2>/dev/null || echo "0")
        
        project_info="$name|$publisher|$version|$target|$runtime|$platform|$dep_count"
    else
        # Basic parsing without jq
        local name publisher version
        
        name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$app_json_file" 2>/dev/null | cut -d'"' -f4 || echo "Unknown")
        publisher=$(grep -o '"publisher"[[:space:]]*:[[:space:]]*"[^"]*"' "$app_json_file" 2>/dev/null | cut -d'"' -f4 || echo "Unknown")
        version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$app_json_file" 2>/dev/null | cut -d'"' -f4 || echo "1.0.0.0")
        
        project_info="$name|$publisher|$version|Unknown|Unknown|Unknown|0"
    fi
    
    echo "$project_info"
}

analyze_al_files() {
    local project_dir="$1"
    local stats="0|0|0|0|0|0|0|0|0|0|0"
    
    if [ "$INCLUDE_STATS" != "true" ]; then
        echo "$stats"
        return 0
    fi
    
    local al_files
    al_files=$(find "$project_dir" -name "*.al" -type f 2>/dev/null || true)
    
    if [ -z "$al_files" ]; then
        echo "$stats"
        return 0
    fi
    
    local total_files=0
    local tables=0 pages=0 codeunits=0 reports=0 enums=0 interfaces=0
    local extensions=0 permissions=0 xmlports=0 controls=0
    
    while IFS= read -r al_file; do
        if [ -z "$al_file" ]; then continue; fi
        
        ((total_files++))
        
        # Analyze file content for object types
        if [ -f "$al_file" ]; then
            local content
            content=$(head -n 20 "$al_file" 2>/dev/null || echo "")
            
            # Count object types based on keywords
            if echo "$content" | grep -qi "^[[:space:]]*table[[:space:]]"; then
                ((tables++))
            elif echo "$content" | grep -qi "^[[:space:]]*tableextension[[:space:]]"; then
                ((extensions++))
            elif echo "$content" | grep -qi "^[[:space:]]*page[[:space:]]"; then
                ((pages++))
            elif echo "$content" | grep -qi "^[[:space:]]*pageextension[[:space:]]"; then
                ((extensions++))
            elif echo "$content" | grep -qi "^[[:space:]]*codeunit[[:space:]]"; then
                ((codeunits++))
            elif echo "$content" | grep -qi "^[[:space:]]*report[[:space:]]"; then
                ((reports++))
            elif echo "$content" | grep -qi "^[[:space:]]*enum[[:space:]]"; then
                ((enums++))
            elif echo "$content" | grep -qi "^[[:space:]]*interface[[:space:]]"; then
                ((interfaces++))
            elif echo "$content" | grep -qi "^[[:space:]]*permissionset[[:space:]]"; then
                ((permissions++))
            elif echo "$content" | grep -qi "^[[:space:]]*xmlport[[:space:]]"; then
                ((xmlports++))
            elif echo "$content" | grep -qi "^[[:space:]]*controladdin[[:space:]]"; then
                ((controls++))
            fi
        fi
    done <<< "$al_files"
    
    stats="$total_files|$tables|$pages|$codeunits|$reports|$enums|$interfaces|$extensions|$permissions|$xmlports|$controls"
    echo "$stats"
}

detect_project_type() {
    local project_dir="$1"
    local app_json_info="$2"
    local al_stats="$3"
    
    # Parse info
    IFS='|' read -r name publisher version target runtime platform dep_count <<< "$app_json_info"
    IFS='|' read -r total_files tables pages codeunits reports enums interfaces extensions permissions xmlports controls <<< "$al_stats"
    
    local project_type="Extension"
    
    # Determine project type based on various factors
    if [[ "$publisher" == "Microsoft" ]]; then
        project_type="Microsoft Base"
    elif [[ "$name" == *"Base Application"* ]] || [[ "$name" == *"System Application"* ]]; then
        project_type="BC Application"
    elif [[ "$name" == *"Test"* ]] || [[ "$project_dir" == *"test"* ]]; then
        project_type="Test Project"
    elif [[ "$total_files" -gt 50 ]]; then
        project_type="Large Extension"
    elif [[ "$name" == *"Library"* ]] || [[ "$name" == *"Framework"* ]]; then
        project_type="Library"
    elif [[ "$interfaces" -gt 2 ]]; then
        project_type="Interface Library"
    elif [[ "$extensions" -gt "$((tables + pages + codeunits))" ]]; then
        project_type="Extension Pack"
    fi
    
    echo "$project_type"
}

detect_namespace() {
    local project_dir="$1"
    local namespace=""
    
    # Look for namespace in AL files
    local al_files
    al_files=$(find "$project_dir" -name "*.al" -type f -exec head -n 10 {} \; 2>/dev/null | head -n 100)
    
    if [ -n "$al_files" ]; then
        # Extract namespace from AL object declarations
        namespace=$(echo "$al_files" | grep -o 'namespace[[:space:]]\+[A-Za-z0-9.]\+' | head -n 1 | awk '{print $2}' || echo "")
        
        # If no explicit namespace, try to infer from object names
        if [ -z "$namespace" ]; then
            local object_names
            object_names=$(echo "$al_files" | grep -E '^[[:space:]]*(table|page|codeunit|report)' | head -n 10)
            
            # Look for common namespace patterns in object names
            if echo "$object_names" | grep -qi "Microsoft"; then
                namespace="Microsoft.*"
            fi
        fi
    fi
    
    echo "${namespace:-Unknown}"
}

get_directory_size() {
    local dir="$1"
    
    if [ -d "$dir" ]; then
        du -sh "$dir" 2>/dev/null | cut -f1 || echo "Unknown"
    else
        echo "N/A"
    fi
}

scan_projects() {
    local scan_path="$1"
    local projects=()
    
    log "Scanning for AL projects in: $scan_path"
    
    # Find all app.json files
    local app_json_files
    app_json_files=$(find_app_json_files "$scan_path" "$MAX_DEPTH")
    
    if [ -z "$app_json_files" ]; then
        log_warning "No app.json files found in $scan_path"
        return 0
    fi
    
    # Analyze each project
    while IFS= read -r app_json_file; do
        if [ -z "$app_json_file" ]; then continue; fi
        
        local project_dir
        project_dir=$(dirname "$app_json_file")
        
        [ "$VERBOSE" = "true" ] && log_info "Analyzing project: $project_dir"
        
        # Get project information
        local app_json_info al_stats project_type namespace dir_size
        
        app_json_info=$(analyze_app_json "$app_json_file")
        al_stats=$(analyze_al_files "$project_dir")
        project_type=$(detect_project_type "$project_dir" "$app_json_info" "$al_stats")
        namespace=$(detect_namespace "$project_dir")
        dir_size=$(get_directory_size "$project_dir")
        
        # Store project data
        local project_data="$project_dir|$app_json_info|$al_stats|$project_type|$namespace|$dir_size"
        projects+=("$project_data")
        
    done <<< "$app_json_files"
    
    # Output results
    output_results "${projects[@]}"
}

output_table() {
    local projects=("$@")
    
    if [ ${#projects[@]} -eq 0 ]; then
        log_warning "No projects found"
        return 0
    fi
    
    echo
    echo -e "${GREEN}AL Project Structure Analysis${NC}"
    echo "=================================="
    echo
    
    # Header
    printf "%-30s %-20s %-12s %-8s %-15s %-12s %s\n" \
        "PROJECT NAME" "PUBLISHER" "VERSION" "FILES" "TYPE" "NAMESPACE" "SIZE"
    printf "%-30s %-20s %-12s %-8s %-15s %-12s %s\n" \
        "------------" "---------" "-------" "-----" "----" "---------" "----"
    
    # Data rows
    for project_data in "${projects[@]}"; do
        IFS='|' read -r project_dir name publisher version target runtime platform dep_count \
                      total_files tables pages codeunits reports enums interfaces extensions permissions xmlports controls \
                      project_type namespace dir_size <<< "$project_data"
        
        printf "%-30s %-20s %-12s %-8s %-15s %-12s %s\n" \
            "${name:0:29}" \
            "${publisher:0:19}" \
            "${version:0:11}" \
            "$total_files" \
            "${project_type:0:14}" \
            "${namespace:0:11}" \
            "$dir_size"
    done
    
    echo
    
    # Detailed statistics if requested
    if [ "$INCLUDE_STATS" = "true" ] && [ "$VERBOSE" = "true" ]; then
        echo -e "${CYAN}Detailed Object Statistics:${NC}"
        echo
        printf "%-30s %-6s %-6s %-6s %-6s %-6s %-6s %-6s\n" \
            "PROJECT NAME" "TABLES" "PAGES" "CODES" "REPS" "ENUMS" "INTS" "EXTS"
        printf "%-30s %-6s %-6s %-6s %-6s %-6s %-6s %-6s\n" \
            "------------" "------" "-----" "-----" "----" "-----" "----" "----"
        
        for project_data in "${projects[@]}"; do
            IFS='|' read -r project_dir name publisher version target runtime platform dep_count \
                          total_files tables pages codeunits reports enums interfaces extensions permissions xmlports controls \
                          project_type namespace dir_size <<< "$project_data"
            
            printf "%-30s %-6s %-6s %-6s %-6s %-6s %-6s %-6s\n" \
                "${name:0:29}" "$tables" "$pages" "$codeunits" "$reports" "$enums" "$interfaces" "$extensions"
        done
        echo
    fi
    
    # Summary
    local total_projects=${#projects[@]}
    local total_files=0
    local microsoft_projects=0
    local custom_projects=0
    
    for project_data in "${projects[@]}"; do
        IFS='|' read -r project_dir name publisher version target runtime platform dep_count \
                      files tables pages codeunits reports enums interfaces extensions permissions xmlports controls \
                      project_type namespace dir_size <<< "$project_data"
        
        total_files=$((total_files + files))
        
        if [[ "$publisher" == "Microsoft" ]]; then
            ((microsoft_projects++))
        elif [[ "$namespace" != "Unknown" && "$namespace" != "Microsoft.*" ]]; then
            ((custom_projects++))
        fi
    done
    
    echo -e "${GREEN}Summary:${NC}"
    echo "  Total Projects: $total_projects"
    echo "  Total AL Files: $total_files"
    echo "  Microsoft Projects: $microsoft_projects"
    echo "  Custom Projects: $custom_projects"
    echo
}

output_json() {
    local projects=("$@")
    
    echo "{"
    echo "  \"scan_info\": {"
    echo "    \"scan_path\": \"$SCAN_PATH\","
    echo "    \"scan_time\": \"$(date -Iseconds)\","
    echo "    \"max_depth\": $MAX_DEPTH,"
    echo "    \"include_stats\": $INCLUDE_STATS"
    echo "  },"
    echo "  \"projects\": ["
    
    local first=true
    for project_data in "${projects[@]}"; do
        IFS='|' read -r project_dir name publisher version target runtime platform dep_count \
                      total_files tables pages codeunits reports enums interfaces extensions permissions xmlports controls \
                      project_type namespace dir_size <<< "$project_data"
        
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        
        echo "    {"
        echo "      \"path\": \"$project_dir\","
        echo "      \"name\": \"$name\","
        echo "      \"publisher\": \"$publisher\","
        echo "      \"version\": \"$version\","
        echo "      \"target\": \"$target\","
        echo "      \"runtime\": \"$runtime\","
        echo "      \"platform\": \"$platform\","
        echo "      \"dependencies_count\": $dep_count,"
        echo "      \"project_type\": \"$project_type\","
        echo "      \"namespace\": \"$namespace\","
        echo "      \"directory_size\": \"$dir_size\","
        echo "      \"al_objects\": {"
        echo "        \"total_files\": $total_files,"
        echo "        \"tables\": $tables,"
        echo "        \"pages\": $pages,"
        echo "        \"codeunits\": $codeunits,"
        echo "        \"reports\": $reports,"
        echo "        \"enums\": $enums,"
        echo "        \"interfaces\": $interfaces,"
        echo "        \"extensions\": $extensions,"
        echo "        \"permissions\": $permissions,"
        echo "        \"xmlports\": $xmlports,"
        echo "        \"controls\": $controls"
        echo "      }"
        echo -n "    }"
    done
    
    echo
    echo "  ]"
    echo "}"
}

output_yaml() {
    local projects=("$@")
    
    echo "scan_info:"
    echo "  scan_path: '$SCAN_PATH'"
    echo "  scan_time: '$(date -Iseconds)'"
    echo "  max_depth: $MAX_DEPTH"
    echo "  include_stats: $INCLUDE_STATS"
    echo
    echo "projects:"
    
    for project_data in "${projects[@]}"; do
        IFS='|' read -r project_dir name publisher version target runtime platform dep_count \
                      total_files tables pages codeunits reports enums interfaces extensions permissions xmlports controls \
                      project_type namespace dir_size <<< "$project_data"
        
        echo "  - path: '$project_dir'"
        echo "    name: '$name'"
        echo "    publisher: '$publisher'"
        echo "    version: '$version'"
        echo "    target: '$target'"
        echo "    runtime: '$runtime'"
        echo "    platform: '$platform'"
        echo "    dependencies_count: $dep_count"
        echo "    project_type: '$project_type'"
        echo "    namespace: '$namespace'"
        echo "    directory_size: '$dir_size'"
        echo "    al_objects:"
        echo "      total_files: $total_files"
        echo "      tables: $tables"
        echo "      pages: $pages"
        echo "      codeunits: $codeunits"
        echo "      reports: $reports"
        echo "      enums: $enums"
        echo "      interfaces: $interfaces"
        echo "      extensions: $extensions"
        echo "      permissions: $permissions"
        echo "      xmlports: $xmlports"
        echo "      controls: $controls"
    done
}

output_results() {
    local projects=("$@")
    
    case "$OUTPUT_FORMAT" in
        "json")
            output_json "${projects[@]}"
            ;;
        "yaml")
            output_yaml "${projects[@]}"
            ;;
        "table"|*)
            output_table "${projects[@]}"
            ;;
    esac
}

main() {
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validate environment
    check_path
    
    # Scan and analyze projects
    scan_projects "$SCAN_PATH"
    
    log_success "AL structure analysis completed"
}

# Run main function with all arguments
main "$@"